import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exposeEmbedUrls } from '../dist/lib/documented-embed-provider.js';

const fixtures = [
  ['vidlink', 'https://vidlink.pro/movie/634649', 'https://vidlink.pro/tv/1399/1/2'],
  ['moviesapi', 'https://moviesapi.to/movie/634649', 'https://moviesapi.to/tv/1399/1/2'],
  ['vidfast', 'https://vidfast.vc/movie/634649', 'https://vidfast.vc/tv/1399/1/2'],
  ['vidplus', 'https://player.vidplus.to/embed/movie/634649', 'https://player.vidplus.to/embed/tv/1399/1/2'],
  ['superembed', 'https://multiembed.mov/?video_id=634649&tmdb=1', 'https://multiembed.mov/?video_id=1399&tmdb=1&s=1&e=2'],
  ['ezvidapi', 'https://ezvidapi.com/embed/movie/634649', 'https://ezvidapi.com/embed/tv/1399/1/2'],
];
const movie = { type: 'movie', tmdbId: '634649', title: '', releaseYear: '', imdbId: '' };
const tv = { ...movie, type: 'tv', tmdbId: '1399', s: 1, e: 2 };
for (const [name, movieUrl, tvUrl] of fixtures) {
  const module = await import(`../dist/providers/${name}/${name}.js`);
  const Provider = Object.values(module)[0];
  test(`${name}: documented movie/TV endpoints and malformed ID rejection`, () => {
    const provider = new Provider();
    assert.equal(provider.buildEmbedUrl(movie), movieUrl);
    assert.equal(provider.buildEmbedUrl(tv), tvUrl);
    assert.throws(() => provider.buildEmbedUrl({ ...movie, tmdbId: '../admin?x=1' }));
    assert.throws(() => provider.buildEmbedUrl({ ...tv, s: 0 }));
    assert.throws(() => provider.buildEmbedUrl({ ...tv, e: undefined }));
  });
}
const { VidLinkProvider } = await import('../dist/providers/vidlink/vidlink.js');
test('HTML source stays an embed, with no invented language/quality; public conversion does not mutate cache', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<!doctype html><html><video></video></html>', { headers: { 'content-type': 'text/html' } }));
  const result = await new VidLinkProvider().getMovieSources(movie);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].type, 'embed');
  assert.equal(result.sources[0].quality, 'unknown');
  assert.deepEqual(result.sources[0].audioTracks, []);
  const wrapped = result.sources[0].url;
  assert.equal(exposeEmbedUrls(result).sources[0].url, fixtures[0][1]);
  assert.equal(result.sources[0].url, wrapped);
  const hls = { sources: [{ ...result.sources[0], type: 'hls' }] };
  assert.equal(exposeEmbedUrls(hls).sources[0].url, wrapped);
});
for (const [label, body, options] of [
  ['HTTP failure', 'unavailable', { status: 503 }],
  ['JSON instead of player', '{}', { headers: { 'content-type': 'application/json' } }],
  ['browser challenge', '<html><title>Just a moment...</title></html>', { headers: { 'content-type': 'text/html' } }],
  ['soft 404', '<html><title>Not Found</title></html>', { headers: { 'content-type': 'text/html' } }],
]) test(`${label} produces diagnostics, not a working source`, async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(body, options));
  const result = await new VidLinkProvider().getMovieSources(movie);
  assert.equal(result.sources.length, 0);
  assert.equal(result.diagnostics[0].code, 'PROVIDER_ERROR');
});
test('homepage redirect is not accepted as a movie player', async t => {
  const response = new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
  Object.defineProperty(response, 'url', { value: 'https://vidlink.pro/' });
  t.mock.method(globalThis, 'fetch', async () => response);
  assert.equal((await new VidLinkProvider().getMovieSources(movie)).sources.length, 0);
});
test('SuperEmbed accepts its observed player redirect but still rejects browser challenges', async t => {
  const { SuperEmbedProvider } = await import('../dist/providers/superembed/superembed.js');
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    const response = new Response('<html><iframe></iframe></html>', { headers: { 'content-type': 'text/html' } });
    Object.defineProperty(response, 'url', { value: 'https://streamingnow.mov/?play=example' });
    return response;
  });
  assert.equal((await new SuperEmbedProvider().getMovieSources(movie)).sources.length, 1);
  fetchMock.mock.mockImplementation(async () => {
    const response = new Response('<html><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script></html>', { headers: { 'content-type': 'text/html' } });
    Object.defineProperty(response, 'url', { value: 'https://streamingnow.mov/?play=example' });
    return response;
  });
  const result = await new SuperEmbedProvider().getMovieSources(movie);
  assert.equal(result.sources.length, 0);
  assert.match(result.diagnostics[0].message, /browser verification/);
});
