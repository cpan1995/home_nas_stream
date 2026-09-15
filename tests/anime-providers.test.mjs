import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { decodeMiruro, miruroEpisodes, resolveMiruro } from '../.local/cinepro-ui/build/server/services/miruro.js';

test('Miruro handles plain and compressed wire responses, rejecting unknown encodings', () => {
  const data = {providers:{kiwi:{episodes:{sub:[{id:'encoded',number:1}]}}}};
  assert.deepEqual(decodeMiruro(JSON.stringify(data),null),data);
  const bytes = gzipSync(JSON.stringify(data));
  assert.deepEqual(decodeMiruro(bytes.toString('base64url'),'1'),data);
  const key = Buffer.from('71951034f8fbcf53d89db52ceb3dc22c','hex');
  for(let i=0;i<bytes.length;i++) bytes[i] ^= key[i%key.length];
  assert.deepEqual(decodeMiruro(bytes.toString('base64url'),'2'),data);
  assert.throws(()=>decodeMiruro('not-json',null));
  assert.throws(()=>decodeMiruro('anything','99'));
});

test('Miruro matches exact episode and dub, and preserves raw pipe IDs', () => {
  const data = {providers:{kiwi:{episodes:{sub:[{number:1,id:'raw-id'}],dub:[{number:2,id:'host:episode'}]}},pewe:{episodes:[{number:2,id:'sub-only'}]}}};
  assert.deepEqual(miruroEpisodes(data,2,'dub'),[{provider:'kiwi',episodeId:Buffer.from('host:episode').toString('base64url')}]);
  assert.deepEqual(miruroEpisodes(data,1,'dub'),[]);
  assert.deepEqual(miruroEpisodes(data,2,'sub'),[{provider:'pewe',episodeId:'sub-only'}]);
});

test('resolver falls back across empty providers without dropping subtitle tracks', async () => {
  const calls=[];
  const request=async url=>{
    const payload=JSON.parse(Buffer.from(new URL(url).searchParams.get('e'),'base64url'));
    calls.push(payload);
    return Response.json(payload.path==='episodes' ? {providers:{empty:{episodes:{sub:[{number:3,id:'empty'}]}},kiwi:{episodes:{sub:[{number:3,id:'raw-pipe-id'}]}}}} : payload.query.provider==='empty' ? {streams:[]} : {streams:[{url:'https://media.example/video.m3u8',type:'hls'}],subtitles:[{url:'https://media.example/en.vtt',label:'English'}]});
  };
  const result=await resolveMiruro(999001,3,'sub',request);
  assert.equal(result.subtitles[0].label,'English');
  assert.equal(calls.at(-1).query.episodeId,'raw-pipe-id');
  assert.equal(calls.at(-1).query.anilistId,999001);
  assert.equal(calls.length,3);
  await resolveMiruro(999001,3,'sub',request);
  assert.equal(calls.length,3,'successful responses are cached');
});

test('unmatched dub is reported without requesting a sub source', async () => {
  let calls=0;
  await assert.rejects(resolveMiruro(999002,1,'dub',async()=>{calls++;return Response.json({providers:{kiwi:{episodes:{sub:[{number:1,id:'sub'}]}}}})}),/no playable source/);
  assert.equal(calls,1);
  await assert.rejects(resolveMiruro(0,1,'sub'),/Invalid/);
});
