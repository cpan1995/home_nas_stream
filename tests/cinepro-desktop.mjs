import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { connectDesktop } from "./cdp.mjs";

const root = await mkdtemp(path.resolve(".local/cinepro-desktop-"));
await mkdir(path.join(root, "movies"));
let healthy = false;
const fixture = createServer((request, response) => {
  if (request.url === "/fixture-ok.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" });
    response.end("window.fixtureScriptLoaded = true");
    return;
  }
  if (request.url === "/api/local/health") {
    response.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ application: healthy ? "cinepro-local-ui" : "offline" }));
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html" });
  response.end(`<h1>CinePro desktop fixture</h1><a href="/watch/movie/1">Play fixture</a>
    <script src="/fixture-ok.js"></script>
    <script src="https://unlisted-ad.invalid/advert.js"></script>
    <iframe title="Promotion" src="https://extension-promotion.invalid/install"></iframe>
    <button onclick="window.open('https://example.com')">Popup</button>
    <a id="escape" href="https://example.com">External link</a>
    <a id="nas" href="/__screening-room/nas">NAS Library</a>`);
});
fixture.listen(0, "127.0.0.1");
await once(fixture, "listening");
const origin = `http://127.0.0.1:${fixture.address().port}`;
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const app = spawn(path.resolve("build/native-test/screening-room"), [
  "--no-network-remote", "--library", path.join(root, "movies"), "--data-dir", path.join(root, "data"), "--offline", "--cinepro",
], { env: { ...process.env, QT_QPA_PLATFORM: process.env.SCREENING_ROOM_TEST_PLATFORM || "offscreen",
  QTWEBENGINE_CHROMIUM_FLAGS: "--disable-gpu", QTWEBENGINE_REMOTE_DEBUGGING: `127.0.0.1:${port}`,
  SCREENING_ROOM_TEST_OUTPUT_DIR: root, SCREENING_ROOM_CINEPRO_TEST_URL: `${origin}/movies?screeningRoom=1`,
}, stdio: ["ignore", "pipe", "pipe"] });
let log = "", exited = false;
app.stdout.on("data", data => { log += data });
app.stderr.on("data", data => { log += data });
const closed = once(app, "close").then(() => { exited = true });
let desktop, online;
async function until(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (exited) throw Error("Desktop exited: " + log);
    try { const result = await check(); if (result) return result } catch { /* Wait for Qt or CDP. */ }
    await delay(100);
  }
  throw Error("Desktop check timed out");
}
const pages = async () => (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
try {
  desktop = await until(() => connectDesktop(port));
  await until(() => desktop.evaluate("Boolean(window.__screeningPlayer)"));
  assert.equal(await until(() => desktop.call("testClick", "cinepro-retry")), true);
  await desktop.call("capture", "offline.png");
  healthy = true;
  await delay(200);
  await desktop.call("testFocus", "cinepro-retry");
  assert.equal(JSON.parse(await desktop.call("testState")).focusedControl, "cinepro-retry");
  await desktop.call("testKey", "Return");
  online = await until(() => connectDesktop(port, origin));
  await until(() => online.evaluate("document.querySelector('h1')?.textContent.includes('fixture')"));
  assert.equal(await online.evaluate("Boolean(window.qt?.webChannelTransport)"), false);
  assert.equal(await online.evaluate("Boolean(document.querySelector('#screening-room-provider-chrome'))"), false);
  await until(() => online.evaluate("window.fixtureScriptLoaded === true"));
  // Remote postMessage commands cannot grant activation inside the provider frame.
  // Exercise real, unmuted media without CDP's synthetic userGesture override.
  assert.equal(await online.evaluate("navigator.userActivation.hasBeenActive"), false);
  const playback = await online.evaluate(`(async () => {
    const wav = new ArrayBuffer(44 + 16000), bytes = new DataView(wav);
    const text = (offset, value) => [...value].forEach((char, i) => bytes.setUint8(offset + i, char.charCodeAt(0)));
    text(0, 'RIFF'); bytes.setUint32(4, 16036, true); text(8, 'WAVE'); text(12, 'fmt ');
    bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true);
    bytes.setUint32(24, 8000, true); bytes.setUint32(28, 16000, true);
    bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true); text(36, 'data'); bytes.setUint32(40, 16000, true);
    const url = URL.createObjectURL(new Blob([wav], {type: 'audio/wav'}));
    const audio = new Audio(url);
    try {
      await Promise.race([audio.play(), new Promise((_, reject) => setTimeout(() => reject(Error('Playback timed out')), 5000))]);
      return {playing: !audio.paused, muted: audio.muted};
    } catch (error) { return {error: error.name + ': ' + error.message}; }
    finally { audio.pause(); audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); }
  })()`);
  assert.deepEqual(playback, {playing: true, muted: false});
  await until(async () => JSON.parse(await desktop.call("testState")).onlineBlockedRequests >= 2);
  await online.click("button");
  await online.click("#escape");
  assert.equal(await online.evaluate("location.origin"), origin);
  assert.equal((await pages()).filter(p => p.url.startsWith("https://example.com")).length, 0);
  await desktop.call("capture", "online.png");
  await online.click("a");
  await until(() => online.evaluate("location.pathname === '/watch/movie/1'"));
  await until(() => online.evaluate("Boolean(document.querySelector('#nas'))"));
  await online.click("#nas");
  await until(async () => !(await pages()).some(p => p.url.startsWith(origin)));
  online.close(); online = undefined;
  assert.equal(JSON.parse(await desktop.call("testState")).collectionVisible, true);
  await desktop.call("capture", "nas.png");
  await desktop.click(".cinepro-shortcut");
  online = await until(() => connectDesktop(port, origin));
  await until(() => online.evaluate("document.querySelector('h1')?.textContent.includes('fixture')"));
  assert.equal(JSON.parse(await desktop.call("testState")).collectionVisible, false);
  await online.click("#nas");
  await until(async () => !(await pages()).some(p => p.url.startsWith(origin)));
  online.close(); online = undefined;
  await desktop.evaluate("document.querySelector('.cinepro-shortcut').focus()");
  await desktop.call("testKey", "Return");
  online = await until(() => connectDesktop(port, origin));
  await until(() => online.evaluate("document.querySelector('h1')?.textContent.includes('fixture')"));
  assert.equal(await online.evaluate("location.pathname"), "/movies");
  assert.equal(await online.evaluate("new URLSearchParams(location.search).get('screeningRoom')"), "1");
  assert.equal(await online.evaluate("Boolean(window.qt?.webChannelTransport)"), false);
  await online.click("#nas");
  await until(async () => !(await pages()).some(p => p.url.startsWith(origin)));
  online.close(); online = undefined;
  assert.equal(JSON.parse(await desktop.call("testState")).collectionVisible, true);
  console.log("PASS: CinePro rail shortcut (click and Enter), NAS return, offline retry, desktop mode persistence, page teardown, bridge isolation, request filtering, and external navigation blocking.");
  console.log(`Artifacts: ${root}`);
} catch (error) {
  console.error(log);
  throw error;
} finally {
  online?.close(); desktop?.close();
  app.kill("SIGTERM");
  await Promise.race([closed, delay(3000)]);
  if (!exited) { app.kill("SIGKILL"); await closed }
  await writeFile(path.join(root, "desktop.log"), log);
  fixture.closeAllConnections();
  fixture.close();
}
