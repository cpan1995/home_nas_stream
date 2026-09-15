import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactGraph, resolveAnimeEpisode } from '../.local/cinepro-ui/build/server/services/anime-mappings.js';

const graph = compactGraph({
  'tmdb_show:1429:s3': {'anilist:99147':{'1-12':'1-12'},'anilist:104578':{'13-22':'1-10'},'mal:38524':{'13-22':'1-10'}},
  'tmdb_movie:129': {'anilist:199':{'1':'1'}},
  'tmdb_show:1:s1': {'anilist:2':{'1-4':'1-2,5-6','5-':'7-'}},
  'tmdb_show:2:s1': {'anilist:3':{'1-4':'1-8|2'}},
  'tmdb_show:3:s1': {'anilist:4':{'1-4':'1-4'},'anilist:5':{'1-4':'1-4'}},
  'tmdb_show:4:s1': {'anilist:6':{}},
  'anilist:199': {'tmdb_movie:129':{'1':'1'}},
});
test('later parts map to the correct anime ID and restart episode numbering',()=>{
  assert.deepEqual(resolveAnimeEpisode(graph,'tv',1429,3,12),{anilistId:99147,episode:12});
  assert.deepEqual(resolveAnimeEpisode(graph,'tv',1429,3,13),{anilistId:104578,episode:1});
  assert.equal(resolveAnimeEpisode(graph,'tv',1429,2,13),null);
  assert.equal(resolveAnimeEpisode(graph,'tv',1429,3,23),null);
});
test('movies, skipped episodes and open ranges map without copying TMDB IDs',()=>{
  assert.deepEqual(resolveAnimeEpisode(graph,'movie',129),{anilistId:199,episode:1});
  assert.deepEqual(resolveAnimeEpisode(graph,'tv',1,1,3),{anilistId:2,episode:5});
  assert.deepEqual(resolveAnimeEpisode(graph,'tv',1,1,8),{anilistId:2,episode:10});
  assert.equal(graph['anilist:199'],undefined);
  assert.equal(graph['tmdb_show:1429:s3']['mal:38524'],undefined);
});
test('unmatched, ambiguous, ID-only and split episodes are not guessed',()=>{
  for(const id of [2,3,4,999]) assert.equal(resolveAnimeEpisode(graph,'tv',id,1,1),null);
  assert.deepEqual(compactGraph({'tmdb_movie:1':{'anilist:2':{'__proto__':'1'},'anilist:3':['1']}}),{'tmdb_movie:1':{'anilist:2':{}}});
});
