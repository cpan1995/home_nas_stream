const MAX_RESPONSE_BYTES = 16 * 1024;
const MAX_TIMEOUT_MS = 2_147_483_647;

class RemoteRequestError extends Error {}

export const BUTTONS = Object.freeze([
  'Home', 'Back', 'Select', 'Left', 'Right', 'Down', 'Up', 'Rev', 'Fwd',
  'Play', 'Info', 'Backspace', 'Enter', 'VolumeDown', 'VolumeUp',
  'VolumeMute', 'Search', 'InstantReplay',
]);

const BUTTON_SET = new Set(BUTTONS);

function isIpv4(hostname) {
  const parts = hostname.split('.');
  return parts.length === 4 && parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part)
    && Number(part) <= 255);
}

function configuredBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string') throw new TypeError('baseUrl must be a string');
  let url;
  try { url = new URL(baseUrl); } catch { throw new TypeError('baseUrl must be a valid HTTP URL'); }
  if (url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/'
      || url.search || url.hash || (url.hostname !== 'localhost' && !isIpv4(url.hostname))) {
    throw new TypeError('baseUrl must be HTTP at localhost or a literal IPv4 address, with no path, credentials, query, or fragment');
  }
  return url.origin;
}

function validTimeout(timeoutMs) {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0
      || !Number.isSafeInteger(timeoutMs) || timeoutMs > MAX_TIMEOUT_MS) {
    throw new TypeError('timeoutMs must be a positive integer');
  }
  return timeoutMs;
}

function validText(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > 256) return false;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if ((code >= 0 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

export function validateText(text) {
  if (!validText(text)) throw new TypeError('Text must be nonempty, at most 256 UTF-16 code units, printable, and valid Unicode');
}

async function readBoundedBody(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new RemoteRequestError('Remote response exceeded size limit');
      chunks.push(value);
    }
  } catch (error) {
    try { await reader.cancel(); } catch { /* The socket may already be closed. */ }
    throw error;
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

export function createRemote({ baseUrl = 'http://127.0.0.1:8060', timeoutMs = 3000 } = {}) {
  const origin = configuredBaseUrl(baseUrl);
  const timeout = validTimeout(timeoutMs);

  async function request(path, method, headers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      let response;
      try {
        response = await fetch(`${origin}${path}`, { method, headers, redirect: 'manual', signal: controller.signal });
      } catch (error) {
        if (error?.name === 'AbortError') throw new Error('Remote request timed out');
        throw new Error('Remote request failed');
      }
      try {
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel();
          throw new RemoteRequestError('Remote redirect rejected');
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new RemoteRequestError(`Remote request failed (HTTP ${response.status})`);
        }
        return await readBoundedBody(response);
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') throw new Error('Remote request timed out');
        if (error instanceof RemoteRequestError) throw error;
        throw new Error('Remote request failed');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async function mutate(path, headers) {
    try {
      await request(path, 'POST', headers);
      return { accepted: true };
    } catch (error) {
      throw new Error(`${error.message}. Outcome may be unknown; do not retry automatically.`);
    }
  }

  return Object.freeze({
    async pressButton(button) {
      if (!BUTTON_SET.has(button)) throw new TypeError('Unsupported remote button');
      return mutate(`/keypress/${button}`);
    },
    async typeText(text) {
      validateText(text);
      return mutate(`/keypress/Lit_${encodeURIComponent(text)}`);
    },
    async openApp(app) {
      if (app !== 'nas' && app !== 'cinepro') throw new TypeError('app must be nas or cinepro');
      return mutate(`/launch/${app === 'nas' ? 'screening-room' : 'cinepro'}`);
    },
    async openHome(app) {
      if (app !== 'nas' && app !== 'cinepro') throw new TypeError('app must be nas or cinepro');
      if (app === 'nas') return mutate('/launch/screening-room');
      // The existing phone remote's fixed home command also resets the browse URL.
      return mutate('/remote/command/CineProHome', { Origin: origin });
    },
    async getStatus() {
      const activeXml = await request('/query/active-app', 'GET');
      const appMatch = /<app\b[^>]*\bid=["']([^"']+)["']/.exec(activeXml);
      const activeApp = appMatch?.[1] === 'screening-room' ? 'nas'
        : appMatch?.[1] === 'cinepro' ? 'cinepro' : null;
      if (!activeApp) throw new Error('Remote returned an unrecognized active app');
      const stateText = await request('/remote/state', 'GET');
      let state;
      try { state = JSON.parse(stateText); } catch { throw new Error('Remote returned invalid state'); }
      if (!state || Array.isArray(state) || typeof state !== 'object' || !Number.isInteger(state.volume)
          || state.volume < -1 || state.volume > 100) throw new Error('Remote returned invalid state');
      return { activeApp, volume: state.volume === -1 ? null : state.volume };
    },
  });
}
