import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { installNetworkGuard } from './local-network.mjs';

const id = process.argv[2];
assert(/^\d+$/.test(id ?? ''), 'Provide a numeric TMDB movie ID');
const localFetch = globalThis.fetch;
installNetworkGuard(process.env.TMDB_READ_ACCESS_TOKEN);
const directory = `/results/${id}`;
await mkdir(directory, { recursive: true, mode: 0o700 });
const save = (name, data) => writeFile(`${directory}/${name}`, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2), { mode: 0o600 });
const metadata = await fetch(`https://api.themoviedb.org/3/movie/${id}`);
assert(metadata.ok, `TMDB HTTP ${metadata.status}`);
const movie = await metadata.json();
const summary = { checkedAt: new Date().toISOString(), id, title: movie.title, releaseDate: movie.release_date, movieStatus: movie.status, expectedRuntimeMinutes: movie.runtime, sources: [] };
console.log(JSON.stringify(summary));
const response = await localFetch(`http://127.0.0.1:3030/v1/movies/${id}`, {
  headers: { Authorization: `Bearer ${process.env.LOCAL_API_TOKEN}` }, signal: AbortSignal.timeout(180000),
});
const result = await response.json();
await save('result.json', result);
summary.lookupStatus = response.status;
console.log(JSON.stringify({ lookupStatus: response.status, sourceCount: result.sources?.length ?? 0 }));
for (const [index, source] of (result.sources ?? []).entries()) {
  const check = { provider: source.provider?.name, qualityLabel: source.quality, type: source.type };
  summary.sources.push(check);
  try {
    const wrapped = new URL(source.url).searchParams.get('data');
    let upstream;
    if (wrapped) {
      try { upstream = JSON.parse(wrapped); } catch { upstream = JSON.parse(decodeURIComponent(wrapped)); }
    } else upstream = { url: source.url, headers: source.headers };
    check.url = upstream.url;
    check.headers = upstream.headers ?? {};
    if (source.type === 'embed') {
      check.browserRequired = true;
      check.playbackVerified = false;
      console.log(JSON.stringify({ ...check, url: undefined, headers: undefined }));
      continue;
    }
    let current = upstream.url;
    for (let depth = 0; depth < 5; depth++) {
      const manifest = await fetch(current, { headers: upstream.headers });
      assert(manifest.ok, `Playlist HTTP ${manifest.status}`);
      const body = await manifest.text();
      assert(body.length < 2_000_000 && body.trimStart().startsWith('#EXTM3U'), 'Response is not an HLS playlist');
      await save(`source-${index}-playlist-${depth}.m3u8`, body);
      current = manifest.url || current;
      const lines = body.split(/\r?\n/).map(line => line.trim());
      const variant = lines.findIndex(line => line.startsWith('#EXT-X-STREAM-INF:'));
      if (variant !== -1) {
        const path = lines.slice(variant + 1).find(line => line && !line.startsWith('#'));
        assert(path, 'Missing variant URL');
        current = new URL(path, current).href;
        continue;
      }
      check.playlistVerified = true;
      check.durationSeconds = Math.round(lines.filter(line => line.startsWith('#EXTINF:')).reduce((sum, line) => sum + parseFloat(line.slice(8)), 0));
      check.completePlaylist = lines.includes('#EXT-X-ENDLIST');
      check.encrypted = lines.some(line => line.startsWith('#EXT-X-KEY:') && !line.includes('METHOD=NONE'));
      const path = lines.find(line => line && !line.startsWith('#'));
      assert(path, 'Missing media segment');
      const segment = await fetch(new URL(path, current), { headers: { ...upstream.headers, Range: 'bytes=0-1048575' } });
      check.segmentStatus = segment.status;
      check.segmentContentType = segment.headers.get('content-type');
      assert(segment.ok, `Segment HTTP ${segment.status}`);
      const reader = segment.body.getReader();
      const chunks = [];
      let bytes = 0;
      try {
        while (bytes < 1048576) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(value); bytes += value.byteLength;
        }
      } finally { await reader.cancel(); }
      assert(bytes, 'Empty media segment');
      let sample = Buffer.concat(chunks).subarray(0, 1048576);
      await save(`source-${index}-sample.bin`, sample);
      if (check.encrypted) {
        const keyLine = lines.find(line => line.startsWith('#EXT-X-KEY:'));
        assert(keyLine.includes('METHOD=AES-128'), 'Sample decoder supports standard HLS AES-128 only');
        const keyPath = keyLine.match(/URI="([^"]+)"/)?.[1];
        assert(keyPath, 'Missing HLS key URI');
        const keyResponse = await fetch(new URL(keyPath, current), { headers: upstream.headers });
        assert(keyResponse.ok, `HLS key HTTP ${keyResponse.status}`);
        const key = Buffer.from(await keyResponse.arrayBuffer());
        assert(key.length === 16, 'HLS key must contain 16 bytes');
        const ivHex = keyLine.match(/IV=0x([0-9a-f]+)/i)?.[1];
        const iv = ivHex ? Buffer.from(ivHex.padStart(32, '0'), 'hex') : Buffer.alloc(16);
        if (!ivHex) iv.writeBigUInt64BE(BigInt(lines.find(line => line.startsWith('#EXT-X-MEDIA-SEQUENCE:'))?.split(':')[1] ?? 0), 8);
        const decoder = createDecipheriv('aes-128-cbc', key, iv);
        decoder.setAutoPadding(false);
        sample = Buffer.concat([decoder.update(sample.subarray(0, sample.length - sample.length % 16)), decoder.final()]);
        check.hlsKeyVerified = true;
      }
      await save(`source-${index}-sample.ts`, sample);
      check.sampledBytes = Math.min(bytes, 1048576);
      break;
    }
  } catch (error) { check.error = error.message; }
  console.log(JSON.stringify({ ...check, url: undefined, headers: undefined }));
}
await save('summary.json', summary);
await save('links.txt', summary.sources.map((source, index) => `${index + 1}. ${source.provider} (${source.qualityLabel})\n${source.url ?? 'No URL'}\nRequired headers: ${JSON.stringify(source.headers ?? {})}\n`).join('\n'));
console.log(`Results saved to ${directory}`);
