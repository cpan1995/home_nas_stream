import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {createServer as httpServer} from 'node:http';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {connectDesktop} from './cdp.mjs';
import { chromium } from '@playwright/test';
import {connectEcp} from './ecp-client.mjs';

async function freePort() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function until(read, check, label) {
  let value;
  for (let i = 0; i < 100; i++) {
    value = await read();
    if (check(value)) return value;
    await delay(100);
  }
  throw Error(`${label}: ${JSON.stringify(value)}`);
}
const root = await mkdtemp(path.resolve('.local/network-remote-test-'));
await mkdir(path.join(root, 'movies'));
const encoder = spawn('ffmpeg', ['-v','error','-nostdin','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','90','-c:v','libx264','-preset','ultrafast','-crf','35','-c:a','aac',path.join(root,'movies','Remote.Check.2026.mkv')], {stdio:'ignore'});
assert.equal((await once(encoder,'exit'))[0], 0);
const port = await freePort(), cdp = await freePort();
const fixture = httpServer((request, response) => {
  if (request.url === '/api/local/health') {
    response.writeHead(200, {'Content-Type':'application/json'});
    response.end('{"application":"cinepro-local-ui"}'); return;
  }
  response.writeHead(200, {'Content-Type':'text/html'});
  response.end(`<section data-cinema-player><h1>Online remote fixture</h1>
    <button data-remote-default onclick="window.plays=(window.plays||0)+1">Play</button>
    <button aria-label="Forward 10 seconds" onclick="window.skips=(window.skips||0)+1">Forward</button>
    <button aria-label="Mute" onclick="window.mutes=(window.mutes||0)+1">Mute</button>
    <input aria-label="Volume" type="range" min="0" max="1" step=".05" value="1">
    </section>`);
}).listen(0,'127.0.0.1');
await once(fixture,'listening');
const onlineOrigin = `http://127.0.0.1:${fixture.address().port}`;
const app = spawn(process.env.SCREENING_ROOM_TEST_BINARY || path.resolve('build/native-test/screening-room'), ['--offline','--library',path.join(root,'movies'),'--data-dir',path.join(root,'data'),'--remote-port',String(port)], {
  env:{...process.env, QT_FORCE_STDERR_LOGGING:'1', QT_QPA_PLATFORM:'offscreen', QTWEBENGINE_CHROMIUM_FLAGS:'--disable-gpu', QTWEBENGINE_REMOTE_DEBUGGING:`127.0.0.1:${cdp}`, SCREENING_ROOM_TEST_OUTPUT_DIR:root, SCREENING_ROOM_CINEPRO_TEST_URL:onlineOrigin+'/movies?screeningRoom=1'},
  stdio:['ignore','pipe','pipe'],
});
let log = ''; app.stdout.on('data', b => log += b); app.stderr.on('data', b => log += b);
let desktop, online, remote, browser, phone;
try {
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${port}/query/device-info`)).ok; } catch { return false; } }, Boolean, 'Receiver did not start');
  await until(async () => { try { return (await (await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).some(p => p.url.includes('/ui/index.html')); } catch {return false;} }, Boolean, 'Native UI did not start');
  desktop = await connectDesktop(cdp);
  await until(() => desktop.evaluate('!!window.__screeningPlayer'), Boolean, 'Player bridge missing');
  if (process.env.SCREENING_ROOM_REMOTE_TRANSPORT === 'websocket') remote = await connectEcp(`ws://127.0.0.1:${port}/ecp-session`);
  if (process.env.SCREENING_ROOM_REMOTE_TRANSPORT === 'web') {
    browser = await chromium.launch();
    phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await phone.goto(`http://127.0.0.1:${port}/remote/`);
    await phone.locator('#connection[data-state="online"]').waitFor();
    await until(() => desktop.evaluate("!!document.querySelector('.phone-remote-corner svg')"), Boolean, 'QR must be visible without opening a dialog');
    await delay(300);
    await desktop.call('capture', 'phone-remote-corner.png');
    await desktop.evaluate("document.querySelector('[aria-label=\"Phone remote\"]').click()");
    await until(() => desktop.evaluate("document.querySelector('.remote-qr svg')?.outerHTML"), Boolean, 'Native QR code is available');
    await delay(500);
    await desktop.call('capture', 'phone-remote-qr.png');
    await desktop.evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click()");
    await phone.screenshot({ path: path.join(root, 'phone-remote.png') });
  }
  const key = async name => {
    if (phone && ['Up', 'Down', 'Left', 'Right', 'Select', 'Back', 'Home'].includes(name)) {
      if (name === 'Home' || name === 'Back') await phone.locator(`[data-command="${name}"]`).tap();
      else if (name === 'Select') await phone.locator('#trackpad').tap();
      else {
        const box = await phone.locator('#trackpad').boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await phone.mouse.move(x, y); await phone.mouse.down();
        await phone.mouse.move(x + (name === 'Right' ? 50 : name === 'Left' ? -50 : 0), y + (name === 'Down' ? 50 : name === 'Up' ? -50 : 0));
        await phone.mouse.up();
      }
    }
    else
    if (remote) assert.equal((await remote.request('key-press', {'param-key':name})).status,'200');
    else assert.equal((await fetch(`http://127.0.0.1:${port}/keypress/${encodeURIComponent(name)}`, {method:'POST'})).status,200);
  };
  const launch = async name => {
    if (phone && name === 'cinepro') await phone.locator('[data-command="CineProHome"]').tap();
    else if (remote) assert.equal((await remote.request('launch', {'param-channel-id':name})).status,'200');
    else assert.equal((await fetch(`http://127.0.0.1:${port}/launch/${name}`,{method:'POST'})).status,200);
  };
  const state = async () => JSON.parse(await desktop.call('playbackState'));
  await desktop.evaluate("window.remoteKeys=[]; window.addEventListener('keydown', e => window.remoteKeys.push({key:e.key, trusted:e.isTrusted}))");
  await key('Down');
  await until(() => desktop.evaluate('window.remoteKeys'), keys => keys.some(k => k.key === 'ArrowDown' && k.trusted), 'Network input must reach the real WebEngine keyboard path');
  if (phone) await phone.getByRole('button', { name: 'Keyboard', exact: true }).tap();
  else await key('Search');
  await until(() => desktop.evaluate("!!document.querySelector('input[aria-label=\"Search movies\"]')"), Boolean, 'Remote search must open');
  if (phone) {
    await phone.locator('#remote-text').fill('Remote /电影');
    await phone.getByRole('button', { name: 'Send text' }).tap();
  } else await key('Lit_Remote /电影');
  await until(() => desktop.evaluate("document.querySelector('input[aria-label=\"Search movies\"]')?.value"), text => text === 'Remote /电影', 'Unicode remote typing must reach the search input');
  if (phone) await phone.getByRole('button', { name: 'Backspace on TV' }).tap();
  else await key('Backspace');
  await until(() => desktop.evaluate("document.querySelector('input[aria-label=\"Search movies\"]')?.value"), text => text === 'Remote /电', 'Remote Backspace must delete text');
  if (phone) await phone.getByRole('button', { name: 'Done typing' }).tap();
  await key('Back');
  await until(() => desktop.evaluate("!document.querySelector('.search-screen')"), Boolean, 'Back must close search');
  await desktop.evaluate("document.querySelector('[aria-label=\"Play movie\"]').focus()");
  await key('Select');
  await until(state, s => s.duration > 80 && s.position > 0, 'Remote OK must start native playback');
  await key('Play'); await until(state, s => s.paused, 'Remote Play must pause');
  await key('Fwd'); await until(state, s => s.position > 9, 'Remote Forward must seek');
  if (phone) {
    await phone.getByRole('slider', { name: 'Volume', exact: true }).fill('35');
    await phone.getByRole('slider', { name: 'Volume', exact: true }).dispatchEvent('change');
    await until(state, s => s.volume === 35, 'Phone slider sets native volume');
    await phone.getByRole('slider', { name: 'Volume', exact: true }).fill('100');
    await phone.getByRole('slider', { name: 'Volume', exact: true }).dispatchEvent('change');
    await until(state, s => s.volume === 100, 'Phone slider restores native volume');
  }
  await key('VolumeDown'); await until(state, s => s.volume === 95, 'Remote volume down');
  await key('VolumeMute'); await until(state, s => s.volume === 0, 'Remote mute');
  await key('VolumeMute'); await until(state, s => s.volume === 95, 'Remote unmute restores volume');
  await key('Down');
  await until(async () => JSON.parse(await desktop.call('testState')), s => s.focusedControl === 'pause-button', 'Remote arrows navigate native controls');
  await key('Select'); await until(state, s => !s.paused, 'Remote OK activates the native pause button');
  await desktop.call('capture','network-remote-playback.png');
  await key('Home'); await until(() => state().catch(() => null), s => s && !s.id, 'Home must stop playback');
  // Home reloads the collection, so reconnect to its bridge before checking it.
  await until(() => desktop.evaluate('!!window.__screeningPlayer'), Boolean, 'Home restores collection');
  await until(() => desktop.evaluate("!!document.querySelector('[aria-label=\"Play movie\"]')"), Boolean, 'Home displays the library');
  await desktop.call('capture','network-remote-library.png');
  await launch('cinepro');
  await until(async () => { try { online = await connectDesktop(cdp,onlineOrigin); return true; } catch {return false;} },Boolean,'Launch CinePro');
  await until(() => online.evaluate("!!document.querySelector('[data-cinema-player]')"),Boolean,'Online controls load');
  assert.equal(await online.evaluate('!!window.qt?.webChannelTransport'),false);
  await key('Play'); await until(() => online.evaluate('window.plays'),n => n === 1,'Remote play reaches online controls');
  await key('Fwd'); await until(() => online.evaluate('window.skips'),n => n === 1,'Remote seek reaches online controls');
  await key('VolumeMute'); await until(() => online.evaluate('window.mutes'),n => n === 1,'Remote mute reaches online controls');
  await key('VolumeDown'); await until(() => online.evaluate('document.querySelector("input").value'),v => v === '0.95','Remote volume reaches online controls');
  if (phone) {
    await phone.getByRole('slider', { name: 'Volume', exact: true }).fill('40');
    await phone.getByRole('slider', { name: 'Volume', exact: true }).dispatchEvent('change');
    await until(() => online.evaluate('document.querySelector("input").value'), v => v === '0.4', 'Phone slider sets CinePro volume');
  }
  assert((await (await fetch(`http://127.0.0.1:${port}/query/active-app`)).text()).includes('id="cinepro"'));
  await key('Home');
  await until(() => state().catch(() => null),s => s && !s.id,'Return to NAS after online control');
  console.log(`PASS: ${phone ? 'Browser' : remote ? 'WebSocket' : 'HTTP'} remote commands drive real WebEngine navigation, Unicode typing, NAS playback, seeking, volume, mute, Home, and isolated CinePro controls.`);
} catch (error) {
  console.error(log); throw error;
} finally {
  await browser?.close();
  remote?.close(); online?.close(); desktop?.close(); app.kill('SIGTERM'); fixture.close();
  await writeFile(path.join(root,'app.log'),log);
  console.log(`Remote integration artifacts: ${root}`);
}
