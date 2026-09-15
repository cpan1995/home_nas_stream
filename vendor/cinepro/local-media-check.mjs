import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { installNetworkGuard } from './local-network.mjs';

installNetworkGuard(process.env.TMDB_READ_ACCESS_TOKEN);
const result = JSON.parse(await readFile('/results/local-result.json', 'utf8'));
const source = result.sources.find(source => source.type === 'hls');
assert(source, 'A returned HLS source is required for this check');
const encoded = new URL(source.url).searchParams.get('data');
const upstream = JSON.parse(decodeURIComponent(encoded));
let current = upstream.url;
let segment;
for (let depth = 0; depth < 4; depth++) {
  const response = await fetch(current, { headers: upstream.headers, signal: AbortSignal.timeout(20000) });
  assert(response.ok, `Manifest returned HTTP ${response.status}`);
  const text = await response.text();
  assert(text.length < 2_000_000 && text.trimStart().startsWith('#EXTM3U'), 'Source must return an HLS playlist');
  const lines = text.split(/\r?\n/).map(line => line.trim());
  const variant = lines.findIndex(line => line.startsWith('#EXT-X-STREAM-INF:'));
  if (variant !== -1) {
    const path = lines.slice(variant + 1).find(line => line && !line.startsWith('#'));
    assert(path, 'Master playlist must contain a variant');
    current = new URL(path, current).href;
    continue;
  }
  const path = lines.find(line => line && !line.startsWith('#'));
  assert(path, 'Media playlist must contain a segment');
  segment = new URL(path, current).href;
  break;
}
assert(segment, 'A segment must be resolved');
const response = await fetch(segment, {
  headers: { ...upstream.headers, Range: 'bytes=0-65535' }, signal: AbortSignal.timeout(20000),
});
assert(response.ok, `Media segment returned HTTP ${response.status}`);
const reader = response.body.getReader();
let bytes = 0;
try {
  while (bytes < 65536) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
  }
} finally { await reader.cancel(); }
assert(bytes > 0, 'Media segment must contain data');
const summary = {
  provider: source.provider?.name, quality: source.quality,
  manifestVerified: true, segmentStatus: response.status,
  segmentContentType: response.headers.get('content-type'), sampledBytes: bytes,
  fullMovieDownloaded: false,
};
await writeFile('/results/media-check-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
