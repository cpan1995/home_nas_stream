import { validateText } from './remote.mjs';

const APPS = new Set(['nas', 'cinepro']);
const MAX_WAIT_MS = 10_000;

function validateWait(name, value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_WAIT_MS) {
    throw new TypeError(`${name} must be a nonnegative integer no greater than ${MAX_WAIT_MS}`);
  }
  return value;
}

function validateApp(app, { optional = false } = {}) {
  if (app === undefined && optional) return undefined;
  if (!APPS.has(app)) throw new TypeError('app must be nas or cinepro');
  return app;
}

function workflowError(name, stage, commandsSent) {
  return new Error(`${name} failed during ${stage} after ${commandsSent} command(s) acknowledged. The failed command may also have executed; do not retry automatically.`);
}

/**
 * Build deliberate, best-effort navigation macros for the two supported apps.
 * The receiver acknowledges commands but cannot read back a search result.
 */
export function createWorkflows(
  remote,
  {
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    loadWaitMs = 2500,
    focusWaitMs = 250,
    resultWaitMs = 1000,
  } = {},
) {
  if (!remote || typeof remote !== 'object') throw new TypeError('remote is required');
  if (typeof sleep !== 'function') throw new TypeError('sleep must be a function');
  const waits = {
    load: validateWait('loadWaitMs', loadWaitMs),
    focus: validateWait('focusWaitMs', focusWaitMs),
    result: validateWait('resultWaitMs', resultWaitMs),
  };

  async function searchTitles({ query, app } = {}) {
    // Validate every caller-controlled value before issuing a command.
    validateText(query);
    if (query.trim().length === 0) throw new TypeError('query must contain non-whitespace text');
    let selectedApp = validateApp(app, { optional: true });
    if (selectedApp === undefined) {
      try {
        selectedApp = (await remote.getStatus()).activeApp;
      } catch {
        throw workflowError('Search workflow', 'reading active app', 0);
      }
      validateApp(selectedApp);
    }

    let commandsSent = 0;
    let stage = 'opening NAS';
    try {
      await remote.openApp('nas');
      commandsSent += 1;
      stage = 'waiting for NAS';
      await sleep(waits.load);

      if (selectedApp === 'cinepro') {
        stage = 'opening CinePro search home';
        await remote.openHome('cinepro');
        commandsSent += 1;
        stage = 'waiting for CinePro';
        await sleep(waits.load);
      }

      stage = 'opening search';
      await remote.pressButton('Search');
      commandsSent += 1;
      stage = 'waiting for search focus';
      await sleep(waits.focus);
      stage = 'typing query';
      await remote.typeText(query);
      commandsSent += 1;
      stage = 'waiting for results';
      await sleep(waits.result);
    } catch {
      throw workflowError('Search workflow', stage, commandsSent);
    }

    return {
      app: selectedApp,
      query,
      status: 'query_entered',
      resultsVerified: false,
      commandsSent,
      message: 'Search timing is best effort; the remote does not provide results readback.',
    };
  }

  async function focusSearchResults({ app } = {}) {
    validateApp(app, { optional: true });

    let current;
    try {
      current = (await remote.getStatus()).activeApp;
      validateApp(current);
    } catch {
      throw workflowError('Focus search results workflow', 'reading active app', 0);
    }
    if (app !== undefined && app !== current) {
      throw new Error('Focus search results workflow app does not match the active app; do not retry automatically.');
    }
    const selectedApp = app ?? current;
    let commandsSent = 0;
    let stage = 'focusing search results';
    try {
      if (selectedApp === 'nas') {
        await remote.pressButton('Enter');
        commandsSent += 1;
      } else {
        for (let index = 0; index < 5; index += 1) {
          stage = `sending Down ${index + 1} of 5`;
          await remote.pressButton('Down');
          commandsSent += 1;
          if (index < 4) {
            stage = `waiting after Down ${index + 1} of 5`;
            await sleep(waits.focus);
          }
        }
      }
    } catch {
      throw workflowError('Focus search results workflow', stage, commandsSent);
    }

    return {
      app: selectedApp,
      status: 'focus_attempted',
      resultsVerified: false,
      commandsSent,
    };
  }

  return Object.freeze({ searchTitles, focusSearchResults });
}
