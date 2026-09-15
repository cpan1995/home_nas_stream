import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('MCP discovery and tool calls through real stdio and HTTP', async (t) => {
  const requests = [];
  let responseCode = 200;
  let unavailableVolume = false;
  const receiver = createServer((req, res) => {
    requests.push({ method: req.method, path: req.url, origin: req.headers.origin });
    res.statusCode = responseCode;
    if (req.url === '/query/active-app') {
      res.end('<active-app><app id="cinepro" type="appl" version="1.0">CinePro</app></active-app>');
    } else if (req.url === '/remote/state') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ volume: unavailableVolume ? -1 : 35 }));
    } else {
      res.end();
    }
  });
  t.after(() => { receiver.closeAllConnections(); receiver.close(); });
  receiver.listen(0, '127.0.0.1');
  await once(receiver, 'listening');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./server.mjs', import.meta.url))],
    env: { ...process.env, SCREENING_ROOM_REMOTE_URL: `http://127.0.0.1:${receiver.address().port}` },
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => { stderr += chunk; });
  const client = new Client({ name: 'screening-room-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(({ name }) => name).sort(), ['focus_search_results', 'get_status', 'open_app', 'press_button', 'search_titles', 'type_text']);
  assert.equal(tools.find(({ name }) => name === 'get_status').annotations.readOnlyHint, true);
  assert.equal(tools.find(({ name }) => name === 'press_button').annotations.idempotentHint, false);
  assert.match(client.getInstructions(), /never automatically retry/i);

  const call = (name, args = {}) => client.callTool({ name, arguments: args });
  const { resources } = await client.listResources();
  assert.ok(resources.some(({ uri }) => uri === 'screening-room://skills/title-search'));
  const skill = await client.readResource({ uri: 'screening-room://skills/title-search' });
  assert.match(skill.contents[0].text, /name: screening-room-search/);
  assert.deepEqual((await call('get_status')).structuredContent, { activeApp: 'cinepro', volume: 35 });
  unavailableVolume = true;
  assert.deepEqual((await call('get_status')).structuredContent, { activeApp: 'cinepro', volume: null });
  for (const button of ['Up', 'Play', 'VolumeMute', 'Fwd']) {
    assert.deepEqual((await call('press_button', { button })).structuredContent, { accepted: true });
    assert.deepEqual(requests.at(-1), { method: 'POST', path: `/keypress/${button}`, origin: undefined });
  }
  const text = '映画 / café? #50% 🎬';
  assert.deepEqual((await call('type_text', { text })).structuredContent, { accepted: true });
  assert.equal(decodeURIComponent(requests.at(-1).path), `/keypress/Lit_${text}`);
  assert.equal(requests.at(-1).path.split('/').length, 3);
  for (const [app, id] of [['nas', 'screening-room'], ['cinepro', 'cinepro']]) {
    assert.deepEqual((await call('open_app', { app })).structuredContent, { accepted: true });
    assert.equal(requests.at(-1).path, `/launch/${id}`);
  }

  const searchStart = requests.length;
  const searching = call('search_titles', { query: '映画 / 50%', app: 'cinepro' });
  // Wait for the first mutation so the next request demonstrably overlaps.
  for (let i = 0; i < 100 && requests.length === searchStart; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const overlapping = await call('press_button', { button: 'Play' });
  assert.equal(overlapping.isError, true);
  assert.match(overlapping.content[0].text, /operation is running/);
  const searched = await searching;
  assert.equal(searched.structuredContent.status, 'query_entered');
  assert.equal(searched.structuredContent.resultsVerified, false);
  assert.deepEqual(requests.slice(searchStart).map(({ path }) => path), [
    '/launch/screening-room', '/remote/command/CineProHome', '/keypress/Search',
    '/keypress/Lit_%E6%98%A0%E7%94%BB%20%2F%2050%25',
  ]);
  assert.equal(requests[searchStart + 1].origin, `http://127.0.0.1:${receiver.address().port}`);
  const focused = await call('focus_search_results', { app: 'cinepro' });
  assert.equal(focused.structuredContent.status, 'focus_attempted');
  assert.deepEqual(requests.slice(-5).map(({ path }) => path), Array(5).fill('/keypress/Down'));

  const count = requests.length;
  for (const [name, args] of [
    ['press_button', { button: 'Power' }],
    ['press_button', { button: 'Up', url: 'http://example.com' }],
    ['open_app', { app: 'shell' }],
    ['type_text', { text: 'bad\ntext' }],
    ['type_text', { text: 'a'.repeat(257) }],
    ['type_text', { text: '\ud800' }],
    ['search_titles', { query: '   ', app: 'nas' }],
    ['search_titles', { query: 'bad\nquery', app: 'nas' }],
    ['search_titles', { query: 'x', app: 'unsupported' }],
  ]) {
    assert.equal((await call(name, args)).isError, true);
  }
  assert.equal(requests.length, count, 'invalid calls never reach receiver');

  responseCode = 429;
  const failed = await call('press_button', { button: 'Play' });
  assert.equal(failed.isError, true);
  assert.match(failed.content[0].text, /429/);
  assert.equal(requests.length, count + 1, 'failed toggle is sent only once');
  assert.equal(stderr, '', 'normal MCP operation does not print diagnostics or typed text');
});
