import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const adapter = (readFileSync('native/Main.qml','utf8').split('name: "screening-room-track-controls"')[1].split('sourceCode: `')[1].split('})();`')[0]+'})();').replace(/const allowedParent = .*;/,'const allowedParent = "http://127.0.0.1:5174";');

test('anime providers preserve mapped IDs and language in the picker', async ({page}) => {
  await page.route('**/api/anime/resolve/**', r=>r.fulfill({json:{match:{anilistId:104578,episode:1}}}));
  await page.route('**/api/tmdb/**', r=>r.fulfill({json:{id:100,title:'Anime fixture',name:'Anime fixture',genres:[],images:{logos:[]},videos:{results:[]},credits:{cast:[]},recommendations:{results:[]},seasons:[],episode_run_time:[24]}}));
  for(const host of ['moviesapi.to','vidlink.pro','vidfast.vc','player.cinezo.live','www.rivestream.app','anixo.buzz','supaplay.fun','megaplay.buzz','ani.megaplay.su','dropfile.cc','anilink.cc','tryembed.us.cc','cinextream.cc','nontongo.win','cdn.4animo.xyz'])
    await page.route(`https://${host}/**`,r=>r.fulfill({contentType:'text/html',body:'<p>Provider fixture</p>'}));
  await page.route('**/api/anime/miruro/**',r=>r.fulfill({status:503,json:{error:'Fixture unavailable'}}));
  await page.goto('/watch/tv/100?s=3&e=13&screeningRoom=1');
  const menu=page.getByRole('dialog',{name:'Servers',exact:true});
  for(const language of ['sub','dub']) for(const [name,url] of [
    ['MegaPlay',`https://megaplay.buzz/stream/ani/104578/1/${language}`],
    ['Anime Player',`https://ani.megaplay.su/ani/104578/1/${language}`],
    ['DropFile',`https://dropfile.cc/player/tv/anilist-104578/1/1?audio=${language}&lang=en&autoplay=0`],
    ['AniLink',`https://anilink.cc/watch/104578/1?variant=${language}&autoplay=1`],
    ['TryEmbed',`https://tryembed.us.cc/embed/anime/104578/1/${language}`],
    ['CineXtream',`https://cinextream.cc/api/embed/anime/${language}/104578/1?color=064be4`],
    ['4Animo',`https://cdn.4animo.xyz/embed/ani/104578/1/${language}`],
    ['Miruro',`http://127.0.0.1:5174/anime-player/104578/1/${language}`],
  ]) {
    await page.getByRole('button',{name:'Servers',exact:true}).click();
    const button=menu.getByRole('button',{name:`${name} · Anime ${language}`,exact:true});
    await expect(button).toBeEnabled();
    if (name === 'TryEmbed' && language === 'sub') await expect(button).not.toContainText('Manual fallback');
    if (name === 'AniLink' || name === 'CineXtream' || name === '4Animo' || (name === 'TryEmbed' && language === 'dub')) await expect(button).toContainText('Manual fallback');
    await button.click();
    await expect(page.locator('.cinema-video')).toHaveAttribute('src',url);
  }
  await page.getByRole('button',{name:'Servers',exact:true}).click();
  await expect(menu.getByRole('button',{name:'Nontongo · Anime dub',exact:true})).toHaveCount(0);
  await menu.getByRole('button',{name:'Nontongo · Anime',exact:true}).click();
  await expect(page.locator('.cinema-video')).toHaveAttribute('src','https://nontongo.win/anime/104578/1/play');
  await page.getByRole('button',{name:'Servers',exact:true}).click();
  await menu.getByRole('button',{name:'Miruro · Anime dub',exact:true}).scrollIntoViewIfNeeded();
  await expect(menu.getByRole('button',{name:'Miruro · Anime dub',exact:true})).toBeInViewport();
  await page.screenshot({path:'.local/screenshots/anime-providers-picker.png'});
});

test('new external hosts expose available native subtitle tracks through the adapter',async({page})=>{
  await page.route('**/anime-adapter-fixture',r=>r.fulfill({contentType:'text/html',body:'<iframe></iframe><script>window.replies=[];addEventListener("message",e=>window.replies.push(e.data))</script>'}));
  for(const url of ['https://megaplay.buzz/stream/ani/20/1/sub','https://ani.megaplay.su/ani/20/1/sub','https://dropfile.cc/player/tv/anilist-20/1/1','https://anilink.cc/watch/20/1?variant=sub','https://tryembed.us.cc/embed/anime/20/1/sub','https://cinextream.cc/api/embed/anime/sub/20/1','https://nontongo.win/anime/20/1/play','https://cdn.4animo.xyz/embed/ani/20/1/sub']) {
    await page.route(url,r=>r.fulfill({contentType:'text/html',body:`<video></video><script>document.querySelector('video').addTextTrack('subtitles','French','fr');${adapter}</script>`}));
    await page.goto('/anime-adapter-fixture');
    await page.locator('iframe').evaluate((frame,url)=>{(frame as HTMLIFrameElement).src=url},url);
    const frame=page.frameLocator('iframe');await expect(frame.locator('video')).toHaveCount(1);
    const command=async(action:string,id?:string)=>page.locator('iframe').evaluate((frame,data)=>(frame as HTMLIFrameElement).contentWindow!.postMessage(data,new URL((frame as HTMLIFrameElement).src).origin),{source:'screening-room-track-control',action,id});
    await command('getTracks');
    await expect.poll(()=>page.evaluate(()=>(window as any).replies.at(-1)?.subtitles?.[0]?.label)).toBe('French');
    await command('selectTrack','sub:native:0');
    await expect.poll(()=>frame.locator('video').evaluate(v=>(v as HTMLVideoElement).textTracks[0].mode)).toBe('showing');
    await command('selectTrack','sub:off');
    await expect.poll(()=>frame.locator('video').evaluate(v=>(v as HTMLVideoElement).textTracks[0].mode)).toBe('disabled');
  }
});

test('Miruro player reports subtitles, accepts selection, and rejects foreign commands',async({page})=>{
  await page.route('**/anime-parent-fixture',r=>r.fulfill({contentType:'text/html',body:'<iframe src="/anime-player/20/1/sub"></iframe><script>window.replies=[];addEventListener("message",e=>window.replies.push(e.data))</script>'}));
  await page.route('**/api/anime/miruro/20/1/sub',r=>r.fulfill({json:{sources:[{url:'/fixture-video.webm',type:'mp4'}],subtitles:[{url:'/fixture.vtt',label:'English',language:'en'},{url:'/fixture.vtt',label:'French',language:'fr'}]}}));
  await page.route('**/fixture-video.webm',r=>r.fulfill({contentType:'video/mp4',body:readFileSync('.local/quality-fixtures/720.mp4')}));
  await page.route('**/fixture.vtt',r=>r.fulfill({contentType:'text/vtt',body:'WEBVTT\n\n00:00:00.000 --> 00:01:00.000\nHello\n'}));
  await page.goto('/anime-parent-fixture');
  const frame=page.frameLocator('iframe');await expect(frame.locator('track')).toHaveCount(2);
  const command=async(action:string,id?:string)=>page.locator('iframe').evaluate((frame,data)=>(frame as HTMLIFrameElement).contentWindow!.postMessage(data,location.origin),{source:'screening-room-track-control',action,id});
  await command('getTracks');
  await expect.poll(()=>page.evaluate(()=>(window as any).replies.findLast((r:any)=>r.source==='screening-room-tracks')?.subtitles.map((t:any)=>t.label))).toEqual(['English','French']);
  await command('selectTrack','sub:1');
  await expect.poll(()=>frame.locator('video').evaluate(v=>(v as HTMLVideoElement).textTracks[1].mode)).toBe('showing');
  await frame.locator('video').evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.example',source:parent,data:{source:'screening-room-track-control',action:'selectTrack',id:'sub:off'}})));
  expect(await frame.locator('video').evaluate(v=>(v as HTMLVideoElement).textTracks[1].mode)).toBe('showing');
  await command('selectTrack','sub:off');
  await expect.poll(()=>frame.locator('video').evaluate(v=>Array.from((v as HTMLVideoElement).textTracks).every(t=>t.mode==='disabled'))).toBe(true);
});

test('Miruro failure provides retry and recovers from a failed lookup',async({page})=>{
  let count=0;
  await page.route('**/api/anime/miruro/20/1/sub',r=>{count++;return count===1?r.fulfill({status:503,json:{error:'Miruro could not load this episode.'}}):r.fulfill({json:{sources:[{url:'/fixture.webm',type:'mp4'}],subtitles:[]}})});
  await page.route('**/fixture.webm',r=>r.fulfill({contentType:'video/mp4',body:readFileSync('.local/quality-fixtures/720.mp4')}));
  await page.goto('/anime-player/20/1/sub');
  await expect(page.getByRole('alert')).toContainText('Miruro could not load');
  await page.getByRole('button',{name:'Retry Miruro'}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(count).toBe(2);
});


test('Miruro HLS decodes frames and obeys remote pause, seek and volume',async({page})=>{
  await page.route('**/anime-hls-fixture',r=>r.fulfill({contentType:'text/html',body:'<iframe src="/anime-player/20/2/sub"></iframe><script>window.replies=[];addEventListener("message",e=>window.replies.push(e.data))</script>'}));
  await page.route('**/api/anime/miruro/20/2/sub',r=>r.fulfill({json:{sources:[{url:'/anime-test/test.m3u8',type:'hls'}],subtitles:[]}}));
  await page.route('**/anime-test/*',r=>{const name=new URL(r.request().url()).pathname.split('/').pop()!;return r.fulfill({body:readFileSync(`.local/cinepro-fixtures/${name}`),contentType:name.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t'})});
  await page.goto('/anime-hls-fixture');
  const video=page.frameLocator('iframe').locator('video');
  await expect.poll(()=>video.evaluate(v=>(v as HTMLVideoElement).readyState)).toBeGreaterThan(1);
  const send=async(data:object)=>page.locator('iframe').evaluate((frame,data)=>(frame as HTMLIFrameElement).contentWindow!.postMessage(data,location.origin),data);
  await send({source:'screening-room-quality-control',action:'probe',session:'test',id:'current'});
  await expect.poll(()=>page.evaluate(()=>(window as any).replies.findLast((r:any)=>r.source==='screening-room-quality')?.frames||0)).toBeGreaterThan(5);
  await expect.poll(()=>video.evaluate(v=>(v as HTMLVideoElement).currentTime)).toBeGreaterThan(.5);
  await send({source:'screening-room-control',action:'pause'});
  await expect.poll(()=>video.evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
  await send({source:'screening-room-control',action:'seek',time:10});
  await expect.poll(()=>video.evaluate(v=>(v as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(10);
  await send({source:'screening-room-control',action:'setVolume',volume:.35});
  await expect.poll(()=>video.evaluate(v=>(v as HTMLVideoElement).volume)).toBe(.35);
});
