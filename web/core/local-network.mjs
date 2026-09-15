import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as request } from 'undici';

export function isPublicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; }
  catch { return false; }
}

export function validateDestination(value) {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      (url.port && !['80', '443'].includes(url.port)) ||
      hostname === 'localhost' || hostname.endsWith('.localhost') ||
      (isIP(hostname) && !isPublicAddress(hostname))) {
    throw new Error('Outbound destination blocked');
  }
  return url;
}

export function installNetworkGuard(token) {
  const dispatcher = new Agent({
    connect: {
      timeout: 10000,
      lookup(hostname, options, callback) {
        lookup(hostname, { all: true, verbatim: true }).then(records => {
          if (!records.length || records.some(record => !isPublicAddress(record.address))) {
            callback(new Error('Private-network DNS destination blocked'));
            return;
          }
          const matching = options.family ? records.filter(r => r.family === options.family) : records;
          if (!matching.length) { callback(new Error('No supported public address')); return; }
          if (options.all) callback(null, matching);
          else callback(null, matching[0].address, matching[0].family);
        }, () => callback(new Error('Provider DNS lookup failed')));
      },
    },
  });

  globalThis.fetch = async (input, init = {}) => {
    let url = validateDestination(typeof input === 'string' || input instanceof URL ? input : input.url);
    const headers = new Headers(init.headers ?? input.headers);
    const tmdb = url.origin === 'https://api.themoviedb.org';
    if (tmdb) {
      if (!token) throw new Error("TMDB read-access token is missing");
      url.searchParams.delete('api_key');
      headers.set('Authorization', `Bearer ${token}`);
    }
    let method = init.method ?? 'GET';
    let body = init.body;
    const timeout = AbortSignal.timeout(20000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await request(url, { ...init, method, body, headers, signal, dispatcher, redirect: 'manual' });
      if (![301, 302, 303, 307, 308].includes(response.status) || !response.headers.get('location')) {
        if (tmdb && !response.ok) {
          await response.body?.cancel();
          throw new Error(`TMDB request failed with HTTP ${response.status}`);
        }
        return response;
      }
      const next = validateDestination(new URL(response.headers.get('location'), url));
      await response.body?.cancel();
      if (tmdb) throw new Error('Unexpected redirect from TMDB blocked');
      if (next.origin !== url.origin) {
        headers.delete('authorization');
        headers.delete('cookie');
      }
      if (response.status === 303 || ([301, 302].includes(response.status) && method === 'POST')) {
        method = 'GET'; body = undefined;
        headers.delete('content-type'); headers.delete('content-length');
      }
      url = next;
    }
    throw new Error('Too many provider redirects');
  };
}
