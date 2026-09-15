import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const exec = promisify(execFile);
const script = fileURLToPath(new URL('./search.mjs', import.meta.url));

test('search CLI uses the same NAS recipe and validates before navigation', async (t) => {
  const requests = [];
  const receiver = createServer((req, res) => { requests.push(req.url); res.end(); });
  t.after(() => { receiver.closeAllConnections(); receiver.close(); });
  receiver.listen(0, '127.0.0.1');
  await once(receiver, 'listening');
  const env = { ...process.env, SCREENING_ROOM_REMOTE_URL: `http://127.0.0.1:${receiver.address().port}` };
  for (const args of [[], ['--app', 'invalid', '--query', 'title'], ['--query', 'bad\nquery']]) {
    await assert.rejects(exec(process.execPath, [script, ...args], { env }), (error) => error.code === 1);
  }
  assert.equal(requests.length, 0);
  const { stdout, stderr } = await exec(process.execPath, [script, '--app', 'nas', '--query', '映画 / title'], { env });
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'query_entered');
  assert.equal(result.resultsVerified, false);
  assert.equal(stderr, '');
  assert.deepEqual(requests, ['/launch/screening-room', '/keypress/Search', '/keypress/Lit_%E6%98%A0%E7%94%BB%20%2F%20title']);
});
