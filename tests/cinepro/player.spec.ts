import {test, expect, type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const source=(type='hls',url='/test-media/test.m3u8',name='Test HLS')=>({url,type,quality:'720p',provider:{id:name,name},audioTracks:[]});
async function setup(page:Page,sources:ReturnType<typeof source>[]) {
  await page.route('**/api/anime/resolve/**',r=>r.fulfill({json:{match:null}}));
  await page.route('**/api/cinepro/v1/health',r=>r.fulfill({json:{spec:'omss',status:'operational'}}));
  await page.route('**/api/tmdb/3/movie/361743?*',r=>r.fulfill({json:{id:361743,title:'Playback test',runtime:1,release_date:'2022-01-01',genres:[]}}));
  await page.route('**/api/cinepro/v1/movies/361743',r=>r.fulfill({json:{id:'test',sources,subtitles:[]}}));
  await page.route('**/test-media/*',async r=>{
    const name=path.basename(new URL(r.request().url()).pathname);
    try {await r.fulfill({body:await readFile(`.local/cinepro-fixtures/${name}`),contentType:name.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t'})}
    catch {await r.fulfill({status:404})}
  });
  await page.route('https://example.com/embed',r=>r.fulfill({contentType:'text/html',body:'<button>Embedded test player</button>'}));
}

test('HLS advances, pauses, seeks, and settings stay visible in fullscreen',async({page})=>{
  await setup(page,[source()]);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/watch/movie/361743');
  const video=page.locator('video');
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThan(1);
  if(await video.evaluate((v:HTMLVideoElement)=>v.paused)) await page.getByTitle('Play',{exact:true}).click();
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(1);
  await page.keyboard.press('Space');
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);
  await page.keyboard.press('ArrowRight');
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(10);
  await page.getByTitle('Fullscreen',{exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await page.getByTitle('Settings',{exact:true}).click();
  const tabs=page.getByRole('tablist');
  await expect(tabs).toBeVisible();
  expect(await tabs.evaluate(el=>document.fullscreenElement?.contains(el))).toBe(true);
  await page.getByRole('tab',{name:'Speed',exact:true}).click();
  await page.getByRole('button',{name:'1.5x',exact:true}).click();
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.playbackRate)).toBe(1.5);
  await page.screenshot({path:'.local/screenshots/cinepro-fullscreen-player.png'});
  await page.keyboard.press('Escape');
  // Headless Chromium does not reliably deliver OS fullscreen Escape; exercise the browser event too.
  await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen()});
  await expect(page.getByTitle('Fullscreen',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('empty sources show an error and retry recovers into an embed',async({page})=>{
  await setup(page,[]);
  await page.goto('/watch/movie/361743');
  await expect(page.getByText('No playable sources were found.',{exact:false})).toBeVisible();
  await page.route('**/api/cinepro/v1/movies/361743',r=>r.fulfill({json:{id:'test',sources:[source('embed','https://example.com/embed','Test Embed')],subtitles:[]}}));
  await page.getByRole('button',{name:'Try Again',exact:true}).click();
  await expect(page.frameLocator('iframe').getByRole('button',{name:'Embedded test player'})).toBeVisible();
  await expect(page.locator('iframe')).toHaveAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-presentation');
});

test('video failure exposes alternative source; embed can switch back to video',async({page})=>{
  await setup(page,[source('mp4','/test-media/missing.mp4','Failed source'),source('embed','https://example.com/embed','Test Embed')]);
  await page.goto('/watch/movie/361743');
  await expect(page.getByText('Playback Error',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Try Test Embed',exact:true}).click();
  await expect(page.frameLocator('iframe').getByRole('button',{name:'Embedded test player'})).toBeVisible();
  await page.getByLabel('Playback source').selectOption('/test-media/missing.mp4');
  await expect(page.getByText('Playback Error',{exact:true})).toBeVisible();
});

test('source server failure is visible and retry recovers',async({page})=>{
  await setup(page,[source()]);
  await page.route('**/api/cinepro/v1/movies/361743',r=>r.fulfill({status:503,json:{error:{code:'UNAVAILABLE',message:'Test source outage'}}}));
  await page.goto('/watch/movie/361743');
  await expect(page.getByText('Test source outage',{exact:true})).toBeVisible();
  await page.unroute('**/api/cinepro/v1/movies/361743');
  await page.route('**/api/cinepro/v1/movies/361743',r=>r.fulfill({json:{id:'test',sources:[source()],subtitles:[]}}));
  await page.getByRole('button',{name:'Try Again'}).click();
  await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThan(1);
});

test('Screening Room defaults to MoviesAPI and offers local server choices without Core',async({page})=>{
  await setup(page,[]);
  const coreRequests:string[]=[];
  page.on('request', request=>{if(request.url().includes('/api/cinepro/'))coreRequests.push(request.url())});
  await page.route('https://moviesapi.to/movie/361743?theme=064be4',r=>r.fulfill({contentType:'text/html',body:'<button>MoviesAPI fixture player</button>'}));
  await page.goto('/watch/movie/361743?screeningRoom=1');
  await expect(page.locator('.cinema-video')).toHaveAttribute('src','https://moviesapi.to/movie/361743?theme=064be4');
  await expect(page.frameLocator('.cinema-video').locator('body')).toContainText('MoviesAPI fixture player');
  await expect(page.locator('.cinema-video')).toHaveCount(1);
  await expect(page.locator('.remote-player-controls').getByRole('button',{name:'Play',exact:true})).toBeVisible();
  await page.goto('/watch/movie/361743');
  await expect(page.frameLocator('.cinema-video').locator('body')).toContainText('MoviesAPI fixture player');
  expect(coreRequests).toEqual([]);
});

test('desktop POSIX locale does not become a TMDB country and empty heroes finish loading',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'language',{get:()=> 'en-POSIX'}));
  const requests:string[]=[];
  await page.route('**/api/tmdb/**',route=>{
    requests.push(route.request().url());
    return route.fulfill({json:{page:1,results:[],genres:[],total_pages:0,total_results:0}});
  });
  await page.goto('/movies?screeningRoom=1');
  await expect(page.getByRole('heading',{name:'Trending Movies'})).toBeVisible();
  await expect(page.getByText('Loading content...', {exact:true})).toHaveCount(0);
  expect(requests.some(url=>url.includes('/movie/now_playing'))).toBe(true);
  expect(requests.map(url=>new URL(url).searchParams.get('region')).filter(Boolean).every(region=>/^[A-Z]{2}$/.test(region!))).toBe(true);
});
