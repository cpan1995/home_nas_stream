import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { isPublicAddress, validateDestination } from './local-network.mjs';

const base = 'http://127.0.0.1:3030';
const headers = { Authorization: `Bearer ${process.env.LOCAL_API_TOKEN}` };
for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.169.254', '::1', '::ffff:127.0.0.1']) assert(!isPublicAddress(ip));
for (const url of ['file:///etc/passwd', 'http://2130706433', 'http://[::1]', 'http://localhost', 'https://example.com:6379']) assert.throws(() => validateDestination(url));
assert.equal((await fetch(base)).status, 401);
assert.equal((await fetch(base, { headers: { ...headers, Origin: 'https://example.com' } })).status, 403);
assert.equal((await fetch(base + '/v1/proxy?data=%7B%7D', { headers })).status, 403);
const health = await fetch(base, { headers });
assert.equal(health.status, 200);
console.log('PASS: local authentication, origin restriction, proxy block, and private-address guards.');

const tmdb = await fetch('https://api.themoviedb.org/3/search/movie?query=Top%20Gun%20Maverick', {
  headers: { Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(20000),
});
if (!tmdb.ok) throw new Error(`TMDB authentication failed: HTTP ${tmdb.status}`);
const movie = (await tmdb.json()).results.find(movie => movie.title === 'Top Gun: Maverick');
assert(movie, 'TMDB must return the expected movie');
console.log(`PASS: TMDB token authenticated; found ${movie.title} (ID ${movie.id}).`);
const started = Date.now();
const response = await fetch(`${base}/v1/movies/${movie.id}`, { headers, signal: AbortSignal.timeout(180000) });
const data = await response.json();
await writeFile('/results/local-result.json', JSON.stringify(data, null, 2), { mode: 0o600 });
const summary = {
  movie: movie.title, tmdbId: movie.id, status: response.status,
  seconds: Math.round((Date.now() - started) / 1000),
  sources: data.sources?.length ?? 0,
  providers: [...new Set((data.sources ?? []).map(source => source.provider?.name ?? source.provider?.id ?? 'unknown'))],
  qualities: [...new Set((data.sources ?? []).map(source => source.quality))],
  error: data.error?.code,
};
await writeFile('/results/local-test-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
if (!response.ok || !summary.sources) process.exitCode = 1;
