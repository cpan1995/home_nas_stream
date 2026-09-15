import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkflows } from './workflows.mjs';

function fakeRemote({ activeApp = 'nas', failAt } = {}) {
  const calls = [];
  let count = 0;
  const mutation = async (kind, value) => {
    calls.push([kind, value]);
    count += 1;
    if (count === failAt) throw new Error('receiver failure with sensitive content');
    return { accepted: true };
  };
  return {
    calls,
    getStatus: async () => ({ activeApp, volume: 30 }),
    openApp: (app) => mutation('openApp', app),
    openHome: (app) => mutation('openHome', app),
    pressButton: (button) => mutation('pressButton', button),
    typeText: (text) => mutation('typeText', text),
  };
}

function workflow(remote, waits = []) {
  return createWorkflows(remote, {
    loadWaitMs: 11,
    focusWaitMs: 22,
    resultWaitMs: 33,
    sleep: async (milliseconds) => { waits.push(milliseconds); },
  });
}

test('searchTitles resets NAS and submits a query without selecting a result', async () => {
  const remote = fakeRemote();
  const waits = [];
  const result = await workflow(remote, waits).searchTitles({ app: 'nas', query: 'The Thing' });
  assert.deepEqual(remote.calls, [
    ['openApp', 'nas'], ['pressButton', 'Search'], ['typeText', 'The Thing'],
  ]);
  assert.deepEqual(waits, [11, 22, 33]);
  assert.deepEqual(result, {
    app: 'nas', query: 'The Thing', status: 'query_entered', resultsVerified: false, commandsSent: 3,
    message: 'Search timing is best effort; the remote does not provide results readback.',
  });
  assert.equal(remote.calls.some(([, value]) => value === 'Enter' || value === 'Select'), false);
});

test('searchTitles starts CinePro from its home endpoint after resetting NAS', async () => {
  const remote = fakeRemote();
  const waits = [];
  const result = await workflow(remote, waits).searchTitles({ app: 'cinepro', query: 'Spirited Away' });
  assert.deepEqual(remote.calls, [
    ['openApp', 'nas'], ['openHome', 'cinepro'], ['pressButton', 'Search'], ['typeText', 'Spirited Away'],
  ]);
  assert.deepEqual(waits, [11, 11, 22, 33]);
  assert.equal(result.commandsSent, 4);
});

test('searchTitles resolves an omitted app from status and keeps the original query', async () => {
  const remote = fakeRemote({ activeApp: 'cinepro' });
  const result = await workflow(remote).searchTitles({ query: '  Astro Boy  ' });
  assert.equal(result.app, 'cinepro');
  assert.equal(result.query, '  Astro Boy  ');
  assert.deepEqual(remote.calls.slice(0, 2), [['openApp', 'nas'], ['openHome', 'cinepro']]);
});

test('invalid input has no side effects and wait settings are bounded', async () => {
  const remote = fakeRemote();
  const flows = workflow(remote);
  for (const query of ['', '   ', 'bad\ntext', '\ud800', 'x'.repeat(257)]) {
    await assert.rejects(flows.searchTitles({ app: 'nas', query }), TypeError);
  }
  await assert.rejects(flows.searchTitles({ app: 'other', query: 'ok' }), TypeError);
  await assert.rejects(flows.focusSearchResults({ app: 'other' }), TypeError);
  assert.deepEqual(remote.calls, []);
  for (const loadWaitMs of [-1, 1.5, 10_001]) {
    assert.throws(() => createWorkflows(remote, { loadWaitMs }), TypeError);
  }
});

test('a failed command stops the search macro and sanitizes the error', async () => {
  const remote = fakeRemote({ failAt: 2 });
  await assert.rejects(
    workflow(remote).searchTitles({ app: 'nas', query: 'do not reveal this title' }),
    (error) => /opening search.*1 command.*do not retry automatically/i.test(error.message)
      && !error.message.includes('do not reveal this title')
      && !error.message.includes('receiver failure'),
  );
  assert.deepEqual(remote.calls, [['openApp', 'nas'], ['pressButton', 'Search']]);
});

test('focusSearchResults checks active app before mutation and sends NAS Enter only', async () => {
  const remote = fakeRemote({ activeApp: 'nas' });
  const result = await workflow(remote).focusSearchResults({ app: 'nas' });
  assert.deepEqual(remote.calls, [['pressButton', 'Enter']]);
  assert.deepEqual(result, { app: 'nas', status: 'focus_attempted', resultsVerified: false, commandsSent: 1 });
});

test('focusSearchResults follows CinePro down-navigation timing without Select or Play', async () => {
  const remote = fakeRemote({ activeApp: 'cinepro' });
  const waits = [];
  const result = await workflow(remote, waits).focusSearchResults({});
  assert.deepEqual(remote.calls, Array.from({ length: 5 }, () => ['pressButton', 'Down']));
  assert.deepEqual(waits, [22, 22, 22, 22]);
  assert.deepEqual(result, { app: 'cinepro', status: 'focus_attempted', resultsVerified: false, commandsSent: 5 });
});

test('focusSearchResults rejects an app mismatch before any command', async () => {
  const remote = fakeRemote({ activeApp: 'nas' });
  await assert.rejects(workflow(remote).focusSearchResults({ app: 'cinepro' }), /does not match.*do not retry automatically/i);
  assert.deepEqual(remote.calls, []);
});
