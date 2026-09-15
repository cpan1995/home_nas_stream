import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { BUTTONS, createRemote } from './remote.mjs';

async function mock(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { baseUrl: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('sends one ECP POST for buttons, text, and app launches', async (t) => {
  const seen = [];
  const receiver = await mock((req, res) => { seen.push([req.method, req.url]); res.end(); });
  t.after(receiver.close);
  const remote = createRemote({ baseUrl: receiver.baseUrl });
  assert.deepEqual(await remote.pressButton('Play'), { accepted: true });
  assert.deepEqual(await remote.typeText('a/b 😀'), { accepted: true });
  assert.deepEqual(await remote.openApp('nas'), { accepted: true });
  assert.deepEqual(seen, [
    ['POST', '/keypress/Play'], ['POST', '/keypress/Lit_a%2Fb%20%F0%9F%98%80'], ['POST', '/launch/screening-room'],
  ]);
  assert.ok(BUTTONS.includes('InstantReplay'));
});

test('reports active app and nullable volume', async (t) => {
  const receiver = await mock((req, res) => {
    if (req.url === '/query/active-app') res.end('<active-app><app id="cinepro">CinePro</app></active-app>');
    else { res.setHeader('content-type', 'application/json'); res.end('{"volume":-1}'); }
  });
  t.after(receiver.close);
  assert.deepEqual(await createRemote({ baseUrl: receiver.baseUrl }).getStatus(), { activeApp: 'cinepro', volume: null });
});

test('CinePro home uses the fixed browser remote endpoint and exact origin', async (t) => {
  const seen = [];
  const receiver = await mock((req, res) => {
    seen.push({ method: req.method, path: req.url, origin: req.headers.origin });
    res.end('{}');
  });
  t.after(receiver.close);
  const remote = createRemote({ baseUrl: receiver.baseUrl });
  assert.deepEqual(await remote.openHome('cinepro'), { accepted: true });
  assert.deepEqual(seen, [{ method: 'POST', path: '/remote/command/CineProHome', origin: receiver.baseUrl }]);
  await assert.rejects(remote.openHome('../anything'), TypeError);
  assert.equal(seen.length, 1);
});

test('rejects unsafe configuration and invalid input before requests', async () => {
  for (const url of ['https://127.0.0.1', 'http://example.test', 'http://127.0.0.1/path', 'http://user@127.0.0.1'])
    assert.throws(() => createRemote({ baseUrl: url }), TypeError);
  for (const timeoutMs of [0, 2_147_483_648]) assert.throws(() => createRemote({ timeoutMs }), TypeError);
  const remote = createRemote();
  for (const text of ['', 'ok\n', '\ud800', 'x'.repeat(257)]) await assert.rejects(remote.typeText(text), TypeError);
  await assert.rejects(remote.pressButton('Power'), TypeError);
  await assert.rejects(remote.openApp('other'), TypeError);
});

test('bounds successful response bodies', async (t) => {
  const receiver = await mock((req, res) => { res.end('x'.repeat(16 * 1024 + 1)); });
  t.after(receiver.close);
  await assert.rejects(createRemote({ baseUrl: receiver.baseUrl }).getStatus(), /size limit/);
});

test('does not retry failed mutations and rejects redirects', async (t) => {
  let calls = 0;
  const receiver = await mock((req, res) => { calls += 1; res.writeHead(302, { location: '/elsewhere' }); res.end(); });
  t.after(receiver.close);
  await assert.rejects(createRemote({ baseUrl: receiver.baseUrl }).pressButton('Play'), /redirect rejected.*outcome may be unknown.*do not retry/i);
  assert.equal(calls, 1);
});

test('times out without replaying a mutation', async (t) => {
  let calls = 0;
  const receiver = await mock((req) => { calls += 1; req.resume(); });
  t.after(receiver.close);
  await assert.rejects(createRemote({ baseUrl: receiver.baseUrl, timeoutMs: 20 }).pressButton('Play'), /timed out.*outcome may be unknown/i);
  assert.equal(calls, 1);
});

test('times out while reading a response body', async (t) => {
  const receiver = await mock((req, res) => { res.write('<active-app>'); });
  t.after(receiver.close);
  await assert.rejects(createRemote({ baseUrl: receiver.baseUrl, timeoutMs: 20 }).getStatus(), /timed out/);
});

test('rejects malformed, null, and out-of-range remote state', async (t) => {
  for (const body of ['null', '[]', '{"volume":101}', '{"volume":1.5}', '{"volume":-2}', '{}']) {
    const receiver = await mock((req, res) => {
      res.end(req.url === '/query/active-app' ? '<active-app><app id="screening-room" /></active-app>' : body);
    });
    await assert.rejects(createRemote({ baseUrl: receiver.baseUrl }).getStatus(), /invalid state/);
    await receiver.close();
  }
});
