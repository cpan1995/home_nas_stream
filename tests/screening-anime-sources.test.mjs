import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync('.local/cinepro-ui/src/client/src/lib/screening-room.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const generated = {};
runInNewContext(ts.transpileModule(readFileSync('.local/cinepro-ui/src/client/src/lib/stream-providers.generated.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: generated });
const exports = {};
runInNewContext(compiled, { exports, require: (id) => { assert.equal(id, "./stream-providers.generated"); return generated; }, URL, URLSearchParams, location: { origin: 'http://127.0.0.1:5174', search: '?screeningRoom=1' }, sessionStorage: { getItem: () => '1', setItem() {} } });

test('anime fallback URLs preserve AniList episodes and never invent Nontongo dub', () => {
  const sources = exports.animeServerSources(184356, 9);
  for (const language of ['sub', 'dub']) {
    for (const [id, expected] of [
      ['anilink', `https://anilink.cc/watch/184356/9?variant=${language}&autoplay=1`],
      ['tryembed', `https://tryembed.us.cc/embed/anime/184356/9/${language}`],
      ['cinextream', `https://cinextream.cc/api/embed/anime/${language}/184356/9?color=064be4`],
      ['4animo', `https://cdn.4animo.xyz/embed/ani/184356/9/${language}`],
    ]) assert.equal(sources.find(s => s.provider.id === `${id}-anime-${language}`)?.url, expected);
  }
  assert.equal(sources.filter(s => s.provider.id.startsWith('nontongo')).length, 1);
  assert.equal(sources.find(s => s.provider.id === 'nontongo-anime').url, 'https://nontongo.win/anime/184356/9/play');
  assert(!exports.screeningServerSources('100', 1, 1).some(s => /anilink|tryembed|cinextream|nontongo|4animo/.test(s.url)));
  for (const args of [[0, 1], [1, 0], [-1, 1], [1, 1.5], [Infinity, 1]]) assert.throws(() => exports.animeServerSources(...args));
});

test('unverified variants stay manual while verified TryEmbed sub can be probed', () => {
  for (const id of ['anilink-anime-sub', 'anilink-anime-dub', 'cinextream-anime-sub', 'nontongo-anime', '4animo-anime-sub', 'tryembed-anime-dub']) assert.equal(exports.screeningManualFallback(id), true);
  assert.equal(exports.screeningManualFallback('tryembed-anime-sub'), false);
  assert.equal(exports.screeningManualFallback('megaplay-anime-sub'), false);
});
