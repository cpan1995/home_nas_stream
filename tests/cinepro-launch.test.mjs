import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const launch=()=>new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['scripts/cinepro-launch.mjs'],{stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);
 child.on('error',reject);child.on('exit',code=>resolve({code,output}));
});
test('five simultaneous launches reuse the same UI and survive launcher exits',async()=>{
 const before=await readFile('.local/cinepro-runtime/ui.pid','utf8');
 const runs=await Promise.all(Array.from({length:5},launch));
 for(const r of runs){assert.equal(r.code,0,r.output);assert.match(r.output,/CinePro is ready/)}
 assert.equal(await readFile('.local/cinepro-runtime/ui.pid','utf8'),before);
 assert.equal((await fetch('http://127.0.0.1:5174/api/local/health')).status,200);
});

test('served HTML references available JavaScript and stylesheet assets', async () => {
 const origin = 'http://127.0.0.1:5174';
 const response = await fetch(`${origin}/?screeningRoom=1`);
 assert.equal(response.status, 200);
 const html = await response.text();
 const assets = [...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)].map(match => match[1]);
 assert(assets.some(asset => asset.endsWith('.js')), 'HTML must load an application script');
 for (const asset of assets) {
  const url = new URL(asset, origin);
  assert.equal(url.origin, origin);
  const result = await fetch(url);
  assert.equal(result.status, 200, `Missing build asset: ${asset}; restart the UI after rebuilding`);
  assert.match(result.headers.get('content-type') || '', asset.endsWith('.js') ? /javascript/ : /text\/css/);
 }
});
