import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const providers = JSON.parse(readFileSync('config/online-filter.json', 'utf8')).providerOrigins;

// Exercise the actual native adapter against provider DOM fixtures. The live
// desktop check separately verifies injection into Qt's isolated frame world.
const trackAdapter = readFileSync('native/Main.qml', 'utf8').split('name: "screening-room-track-controls"')[1]
  .split('sourceCode: `')[1].split('})();`')[0] + '})();';
const providerTrackScript = trackAdapter.replace(/const allowedParent = .*;/, 'const allowedParent = "http://127.0.0.1:5174";')
  .replace('__SCREENING_ROOM_PROVIDERS__', JSON.stringify(providers));
const videoAdapter = (readFileSync('native/Main.qml', 'utf8').split('name: "screening-room-video-controls"')[1]
  .split('sourceCode: `')[1].split('})();`')[0] + '})();').replace(/const allowedParent = .*;/, 'const allowedParent = "http://127.0.0.1:5174";')
  .replace('__SCREENING_ROOM_PROVIDERS__', JSON.stringify(providers));

async function fixture(page: Page) {
  await page.route('**/api/anime/resolve/**', route => route.fulfill({json:{match:null}}));
  await page.route('https://moviesapi.to/**', route => route.fulfill({contentType: 'text/html', body: '<p>Provider fixture</p>'}));
  const items = Array.from({length: 20}, (_, index) => ({id: 100 + index, title: `Movie ${index + 1}`, name: `Show ${index + 1}`, media_type: 'movie', release_date: '2025-01-01', first_air_date: '2025-01-01', overview: 'A remote navigation fixture.', poster_path: '/poster.svg', backdrop_path: '/poster.svg', vote_average: 7.5, vote_count: 50}));
  await page.route('**/api/tmdb/**', route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let json: unknown = {results: items, page: 1, total_pages: 3, total_results: 60};
    if (/\/genre\//.test(path)) json = {genres: [{id: 28, name: 'Action'}, {id: 35, name: 'Comedy'}]};
    else if (/\/watch\/providers\//.test(path)) json = {results: []};
    else if (/\/season\/\d+\/episode\/\d+$/.test(path)) {
      const parts=path.split('/');
      json={id:1,name:'Episode fixture',season_number:Number(parts[parts.length-3]),episode_number:Number(parts[parts.length-1]),air_date:'2025-01-01',overview:'Episode fixture',still_path:'/poster.svg'};
    }
    else if (/\/season\/\d+$/.test(path)) json = {id: 1, episodes: items.slice(0, 8).map((item, index) => ({...item, episode_number: index + 1, name: `Episode ${index + 1}`, still_path: '/poster.svg', runtime: 40}))};
    else if (/\/(movie|tv)\/\d+$/.test(path)) {
      const id = Number(path.split('/').pop());
      json = {...items.find(item => item.id === id) || items[0], id, runtime: 120, genres: [{id: 28, name: 'Action'}],
        images: {logos: [{file_path: '/poster.svg'}], backdrops: [{file_path: '/poster.svg'}], posters: []},
        videos: {results: [{type: 'Trailer', site: 'YouTube', key: 'fixture123'}]}, credits: {cast: []}, recommendations: {results: items.slice(1, 5)}, episode_run_time: [40],
        seasons: [{id: 1, name: 'Season 1', season_number: 1, episode_count: 8}, {id: 2, name: 'Season 2', season_number: 2, episode_count: 8}]};
    } else if (/\/search\/multi$/.test(path)) json = {results: url.searchParams.get('query')?.toLowerCase().includes('zzzz') ? [] : [{...items[0], title: 'Top Gun', media_type: 'movie'}, {...items[1], media_type: 'tv'}]};
    else if (path.endsWith('/configuration')) json = {images: {secure_base_url: 'https://image.tmdb.org/t/p/', poster_sizes: ['w500'], backdrop_sizes: ['original'], logo_sizes: ['original'], still_sizes: ['original'], profile_sizes: ['original']}};
    else if (path.endsWith('/countries')) json = [{iso_3166_1: 'US', english_name: 'United States', native_name: 'United States'}];
    else if (path.endsWith('/languages')) json = [{iso_639_1: 'en', english_name: 'English', name: 'English'}];
    return route.fulfill({json});
  });
  await page.route('https://image.tmdb.org/**', route => route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#243c63"/></svg>'}));
}

test.beforeEach(async ({page}) => fixture(page));

test('arrows navigate the header, horizontal rails, drawer and restore the selected card', async ({page}) => {
  await page.goto('/movies?screeningRoom=1');
  await expect(page.locator('header a[href="/movies"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('header a[href="/shows"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/shows/);
  const cards = page.locator('[data-remote-row] [data-remote-card]');
  await expect(cards.first()).toBeVisible();
  // Reach content using arrows only (hero actions precede the first rail).
  for (let i = 0; i < 15 && !await page.locator(':focus').getAttribute('data-remote-card').then(v => v !== null); i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator(':focus')).toHaveAttribute('data-remote-card', 'true');
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  const id = await page.locator(':focus').getAttribute('data-remote-id');
  await expect(page.locator(':focus')).toBeInViewport();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', {name: 'Media Drawer'});
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(page.locator(':focus')).toHaveAttribute('data-remote-id', id!);
  await page.keyboard.press('Enter');
  await expect(drawer.getByRole('button', {name: 'Play', exact: true})).toBeVisible();
  await drawer.getByRole('button', {name: 'Play', exact: true}).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/watch\//);
  await expect(page.locator('.remote-player-controls')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator(':focus')).toHaveAttribute('data-remote-id', id!);
});

test('anime servers preserve mapped episode IDs, sub/dub, fullscreen and remote controls', async ({page}) => {
  const lookups:string[]=[];
  await page.route('**/api/anime/resolve/**',r=>{lookups.push(r.request().url());return r.fulfill({json:{match:{anilistId:104578,episode:1}}})});
  for(const host of ['player.cinezo.live','anixo.buzz','supaplay.fun']) await page.route(`https://${host}/**`,r=>r.fulfill({contentType:'text/html',body:`<script>
    let paused=true,time=10; window.commands=[];
    addEventListener('message',e=>{if(e.data.source!=='screening-room-control')return;window.commands.push(e.data);
      if(e.data.action==='play')paused=false;if(e.data.action==='pause')paused=true;if(e.data.action==='seek')time=e.data.time;
      parent.postMessage({source:'screening-room-player',event:'playerstatus',ready:true,paused,currentTime:time,duration:1440},'*');});
    </script>`}));
  await page.goto('/watch/tv/100?s=3&e=13&screeningRoom=1');
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeFocused();
  await expect.poll(()=>lookups.length).toBe(1);
  expect(lookups[0]).toContain('/api/anime/resolve/tv/100?season=3&episode=13');
  await page.getByRole('button',{name:'Fullscreen',exact:true}).click();
  const menu=page.getByRole('dialog',{name:'Servers',exact:true});
  for (const [name,url] of [
    ['Cinezo','https://player.cinezo.live/embed/tv/100/3/13?autoplay=false'],
    ['AniXo · Anime sub','https://anixo.buzz/embed/ani/104578/1/sub?autoplay=false'],
    ['AniXo · Anime dub','https://anixo.buzz/embed/ani/104578/1/dub?autoplay=false'],
  ]) {
    await page.getByRole('button',{name:'Servers',exact:true}).focus();await page.keyboard.press('Enter');
    for(let n=0;n<12 && await menu.locator(':focus').getAttribute('aria-label')!==name;n++) await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('button',{name,exact:true})).toBeFocused();
    await expect(menu.getByRole('button',{name,exact:true})).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('.cinema-video')).toHaveCount(1);
    await expect(page.locator('.cinema-video')).toHaveAttribute('src',url);
    await expect(page.getByRole('button',{name:'Play',exact:true})).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeFocused();
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
    await expect(page.getByRole('slider',{name:'Playback position'})).toHaveValue('20');
    await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  }
  await page.getByRole('button',{name:'Servers',exact:true}).click();
  await expect(menu.getByRole('button',{name:'AniXo · Anime dub',exact:true})).toBeFocused();
  for(const name of ['Cinezo · Anime sub','Cinezo · Anime dub','SupaPlay · Anime sub','SupaPlay · Anime dub']) await expect(menu.getByRole('button',{name,exact:true})).toBeDisabled();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('button',{name:'SupaPlay · Anime sub',exact:true})).toBeFocused();
  await expect(menu.getByRole('button',{name:'SupaPlay · Anime sub',exact:true})).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await expect(page.locator('.cinema-video')).toHaveAttribute('src',/anixo.buzz.*dub/);
  await page.screenshot({path:'.local/screenshots/cinepro-anime-servers.png'});
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Servers',exact:true})).toBeFocused();
});

test('anime lookup failure keeps regular servers usable and retry adds anime choices', async ({page}) => {
  await page.route('**/api/anime/resolve/**',r=>r.fulfill({status:503,json:{error:'Unavailable'}}));
  await page.goto('/watch/movie/100?screeningRoom=1');
  await page.getByRole('button',{name:'Servers',exact:true}).click();
  const menu=page.getByRole('dialog',{name:'Servers',exact:true});
  await expect(menu.getByRole('button',{name:'Cinezo',exact:true})).toBeVisible();
  await expect(menu).toContainText('Anime servers could not be checked.');
  await page.route('**/api/anime/resolve/**',r=>r.fulfill({json:{match:{anilistId:199,episode:1}}}));
  await menu.getByRole('button',{name:'Retry anime servers',exact:true}).focus(); await page.keyboard.press('Enter');
  await expect(menu.getByRole('button',{name:'AniXo · Anime sub',exact:true})).toBeVisible();
  await expect(menu.getByRole('button',{name:'MoviesAPI',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Servers',exact:true})).toBeFocused();
});

test('native AniXo adapter retries interrupted startup and changes provider caption menus', async ({page})=>{
  await page.route('**/api/anime/resolve/**',r=>r.fulfill({json:{match:{anilistId:154587,episode:1}}}));
  await page.route('https://anixo.buzz/**',r=>r.fulfill({contentType:'text/html',body:`
    <video></video><div id="controls">Provider controls</div>
    <div id="sub-options"><button class="menu-option active">Off</button><button class="menu-option">English</button><button class="menu-option">Spanish</button></div>
    <script>
      const video=document.querySelector('video');let paused=true,calls=0;
      Object.defineProperties(video,{paused:{get:()=>paused},readyState:{get:()=>4},duration:{get:()=>1440}});
      video.play=()=>{if(++calls===1)return Promise.reject(new DOMException('Source changed','AbortError'));paused=false;video.dispatchEvent(new Event('play'));return Promise.resolve()};
      video.pause=()=>{paused=true;video.dispatchEvent(new Event('pause'))};
      for(const button of document.querySelectorAll('#sub-options button'))button.onclick=()=>{
        for(const other of button.parentElement.children)other.classList.toggle('active',other===button);
      };
      ${videoAdapter}
      ${providerTrackScript}
    </script>`}));
  await page.goto('/watch/tv/100?s=1&e=1&screeningRoom=1');
  await page.getByRole('button',{name:'Servers',exact:true}).click();
  await page.getByRole('button',{name:'AniXo · Anime sub',exact:true}).click();
  await expect(page.locator('.cinema-video')).toHaveAttribute('src',/anixo.buzz/);
  await page.getByRole('button',{name:'Play',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByRole('button',{name:'Play',exact:true})).toBeFocused();
  const frame=page.frames().find(f=>f.url().includes('anixo.buzz'))!;
  expect(await frame.locator('#controls').evaluate(e=>getComputedStyle(e).display)).toBe('none');
  await page.getByRole('button',{name:'Audio & subtitles',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Audio & subtitles',exact:true});
  await dialog.getByRole('button',{name:'Spanish',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Spanish',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await frame.locator('#sub-options .active').textContent()).toBe('Spanish');
  await dialog.getByRole('button',{name:'Off',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Off',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('native Rivestream adapter controls video and provider-loaded subtitles', async ({page}) => {
  await page.route('https://www.rivestream.app/**', r=>r.fulfill({contentType:'text/html',body:`
    <div class="strata-player-reset"><video></video>
      <div class="absolute inset-0 flex">Center controls</div>
      <div class="absolute bottom-0"><div id="subtitle-menu">
        <button class="strata-control-btn"><svg><rect width="18" height="14" /></svg></button>
      </div></div><div class="strata-subtitle-overlay">Caption</div>
    </div><script>
      const video=document.querySelector('video');let paused=true,selected='English';
      Object.defineProperties(video,{paused:{get:()=>paused},readyState:{get:()=>4},duration:{get:()=>600}});
      video.play=()=>{paused=false;video.dispatchEvent(new Event('play'));return Promise.resolve()};
      video.pause=()=>{paused=true;video.dispatchEvent(new Event('pause'))};
      document.querySelector('.strata-control-btn').onclick=()=>{
        const menu=document.createElement('div');menu.className='strata-backdrop';
        for(const label of ['Upload Subtitle','Customize','Off','English','French']) {
          const button=document.createElement('button');
          button.innerHTML='<span title="'+label+'">'+label+'</span>'+(label===selected?'<svg><path d="M20 6 9 17l-5-5" /></svg>':'');
          button.onclick=()=>{selected=label;document.body.dataset.subtitle=label;menu.remove()};menu.append(button);
        }
        document.querySelector('#subtitle-menu').append(menu);
      };
      ${videoAdapter}
      ${providerTrackScript}
    </script>`}));
  await page.goto('/watch/tv/100?s=2&e=3&screeningRoom=1');
  await page.getByRole('button',{name:'Servers',exact:true}).click();
  await page.getByRole('button',{name:'Rivestream',exact:true}).click();
  const play=page.locator('[data-remote-default]');
  await expect(play).toBeFocused();await page.keyboard.press('Enter');
  await expect(play).toHaveAttribute('aria-label','Pause');
  await page.keyboard.press('Enter');await expect(play).toHaveAttribute('aria-label','Play');
  const frame=page.frames().find(f=>f.url().includes('www.rivestream.app'))!;
  expect(await frame.locator('.absolute.bottom-0').evaluate(e=>getComputedStyle(e).display)).toBe('none');
  expect(await frame.locator('.strata-subtitle-overlay').evaluate(e=>getComputedStyle(e).display)).not.toBe('none');
  await page.getByRole('button',{name:'Audio & subtitles',exact:true}).click();
  const menu=page.getByRole('dialog',{name:'Audio & subtitles',exact:true});
  await expect(menu.getByRole('button',{name:'English',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(menu.getByRole('button',{name:'Upload Subtitle',exact:true})).toHaveCount(0);
  await menu.getByRole('button',{name:'French',exact:true}).click();
  await expect(menu.getByRole('button',{name:'French',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await frame.locator('body').getAttribute('data-subtitle')).toBe('French');
  await menu.getByRole('button',{name:'Off',exact:true}).click();
  await expect(menu.getByRole('button',{name:'Off',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await frame.locator('body').getAttribute('data-subtitle')).toBe('Off');
});

test('audio-only provider playback stops with an actionable error and another server recovers', async ({page}) => {
  await page.route('https://player.cinezo.live/**', r => r.fulfill({contentType:'text/html',body:`<video></video><script>
    const video=document.querySelector('video');let paused=true,started=0,time=0;
    Object.defineProperties(video,{paused:{get:()=>paused},readyState:{get:()=>4},duration:{get:()=>600},
      currentTime:{get:()=>paused?time:time+(Date.now()-started)/1000}});
    video.play=()=>{if(paused)started=Date.now();paused=false;video.dispatchEvent(new Event('play'));return Promise.resolve()};
    video.pause=()=>{time=video.currentTime;paused=true;video.dispatchEvent(new Event('pause'))};
    ${videoAdapter}
    </script>`}));
  await page.route('https://vidlink.pro/**', r => r.fulfill({contentType:'text/html',body:`<video></video><script>
    const video=document.querySelector('video');let paused=true,started=0;
    Object.defineProperties(video,{paused:{get:()=>paused},readyState:{get:()=>4},duration:{get:()=>600},
      currentTime:{get:()=>paused?0:(Date.now()-started)/1000},videoWidth:{get:()=>1280},videoHeight:{get:()=>720}});
    video.play=()=>{started=Date.now();paused=false;video.dispatchEvent(new Event('play'));return Promise.resolve()};
    video.pause=()=>{paused=true;video.dispatchEvent(new Event('pause'))};
    ${videoAdapter}
    </script>`}));
  await page.goto('/watch/movie/100?screeningRoom=1');
  await page.getByRole('button',{name:'Servers',exact:true}).click();
  await page.getByRole('button',{name:'Cinezo',exact:true}).click();
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.cinema-notice')).toContainText('Audio has been stopped. Open Quality');
  const broken=page.frames().find(f=>f.url().includes('player.cinezo.live'))!;
  expect(await broken.locator('video').evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.cinema-notice')).toContainText('Audio has been stopped.');
  expect(await broken.locator('video').evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
  await page.getByRole('button',{name:'Servers',exact:true}).click();
  await page.getByRole('button',{name:'VidLink',exact:true}).click();
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('[data-remote-default]')).toHaveAttribute('aria-label','Pause');
  await expect(page.locator('.cinema-notice')).toBeEmpty();
});

test('delayed video startup is not mistaken for an audio-only stream', async ({page}) => {
  await page.route('https://vidlink.pro/**', r => r.fulfill({contentType:'text/html',body:`<video></video><script>
    const video=document.querySelector('video');let paused=true,started=0;
    const elapsed=()=>paused?0:(Date.now()-started)/1000;
    Object.defineProperties(video,{paused:{get:()=>paused},duration:{get:()=>600},
      readyState:{get:()=>elapsed()<6?0:4},currentTime:{get:()=>Math.max(0,elapsed()-6)},
      videoWidth:{get:()=>elapsed()<8?0:1280},videoHeight:{get:()=>elapsed()<8?0:720}});
    video.play=()=>{if(paused)started=Date.now();paused=false;video.dispatchEvent(new Event('play'));return Promise.resolve()};
    video.pause=()=>{paused=true;video.dispatchEvent(new Event('pause'))};
    ${videoAdapter}
    </script>`}));
  await page.goto('/watch/movie/100?screeningRoom=1');
  await page.getByRole('button',{name:'Servers',exact:true}).click();
  await page.getByRole('button',{name:'VidLink',exact:true}).click();
  await page.getByRole('button',{name:'Play',exact:true}).click();
  const frame=page.frames().find(f=>f.url().includes('vidlink.pro'))!;
  await expect.poll(()=>frame.locator('video').evaluate(v=>(v as HTMLVideoElement).currentTime)).toBeGreaterThan(6);
  expect(await frame.locator('video').evaluate(v=>(v as HTMLVideoElement).paused)).toBe(false);
  await expect(page.locator('.cinema-notice')).toBeEmpty();
});

test('remote search types, deletes, changes keyboard, opens results and backs out', async ({page}) => {
  await page.goto('/movies?screeningRoom=1');
  await expect(page.locator('header a[href="/movies"]')).toBeFocused();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', {name: /search/i})).toBeFocused();
  await page.keyboard.press('Enter');
  const input = page.getByRole('textbox', {name: 'Search movies and TV'});
  await expect(input).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', {name: 'Q', exact: true})).toBeFocused();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('T');
  await page.keyboard.press('Backspace');
  await expect(input).toHaveValue('');
  await page.keyboard.type('Top');
  await expect(input).toHaveValue('Top');
  await expect(page.getByRole('button', {name: 'Top Gun', exact: true})).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', {name: 'Top Gun', exact: true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', {name: 'Media Drawer'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', {name: 'Top Gun', exact: true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(input).not.toBeVisible();
  await expect(page.getByRole('button', {name: /search/i})).toBeFocused();
});

test('discover menus and TV season/episode selection stay navigable', async ({page}) => {
  await page.goto('/discover?screeningRoom=1');
  await expect(page.getByRole('button', {name: /Most Popular/})).toBeVisible();
  await page.getByRole('button', {name: /Most Popular/}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitemradio', {name: 'Most Popular', exact: true})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', {name: 'Top Rated', exact: true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', {name: /Top Rated/})).toBeFocused();
  await page.goto('/shows?screeningRoom=1&media=tv-100');
  const drawer = page.getByRole('dialog', {name: 'Media Drawer'});
  const season = drawer.getByRole('combobox', {name: 'Season'});
  await season.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('option', {name: 'Season 1', exact: true})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', {name: 'Season 2', exact: true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(season).toContainText('Season 2');
  await expect(season).toBeFocused();
  await expect(drawer.getByRole('button', {name: 'Play episode 1: Episode 1', exact: true})).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', /Play episode/);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/watch\/tv\/100.*s=2&e=2/);
});

test('MoviesAPI remote controls send commands and reject spoofed status', async ({page}) => {
  await page.route('https://moviesapi.to/movie/100*', route => route.fulfill({contentType: 'text/html', body: `<script>
    window.commands=[]; let paused=true,time=30;
    addEventListener('message', e=>{window.commands.push(e.data); if(e.data.action==='play') paused=false; if(e.data.action==='pause') paused=true; if(e.data.action==='seek') time=e.data.time;
      parent.postMessage({source:'moviesapi-player',event:'playerstatus',paused,currentTime:time,duration:600},'*');});
  </script>`}));
  await page.goto('/watch/movie/100?screeningRoom=1');
  await expect(page.getByRole('button', {name: 'Play', exact: true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', {name: 'Pause', exact: true})).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', {name: 'Rewind 10 seconds'})).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('slider', {name: 'Playback position'})).toHaveValue('40');
  await page.getByRole('slider', {name: 'Playback position'}).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('slider', {name: 'Playback position'})).toHaveValue('50');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.remote-player-controls :focus')).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', {origin: 'https://moviesapi.to', source: window, data: {source:'moviesapi-player',event:'playerstatus',currentTime:999,duration:999,paused:true}})));
  await expect(page.getByRole('slider', {name: 'Playback position'})).toHaveValue('50');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/movies/);
});

test('search numbers, empty results, and settings controls work without mouse input', async ({page}) => {
  await page.goto('/movies?screeningRoom=1');
  await expect(page.locator('header a[href="/movies"]')).toBeFocused();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', {name: '123', exact: true})).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox')).toHaveValue('1');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('zzzz');
  await expect(page.getByRole('status')).toHaveText('0 results');
  await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('status')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', {name: '1', exact: true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox')).not.toBeVisible();
  await page.goto('/settings?screeningRoom=1&tab=playback');
  const toggle = page.getByRole('switch').first();
  await toggle.focus();
  const before = await toggle.getAttribute('aria-checked');
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
  await page.getByRole('tab', {name: /appearance/i}).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[role="tabpanel"] :focus')).toHaveCount(1);
});

test('trailer controls and nested Back return to movie details', async ({page}) => {
  await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({contentType: 'text/javascript', body: `
    window.trailerCommands=[]; window.YT={Player:class {
      constructor(el, options){this.el=el; queueMicrotask(()=>options.events.onReady());}
      playVideo(){window.trailerCommands.push('play')}
      pauseVideo(){window.trailerCommands.push('pause')}
      getCurrentTime(){return 30}
      seekTo(time){window.trailerCommands.push(time)}
      destroy(){this.el.remove()}
    }}; window.onYouTubeIframeAPIReady();` }));
  await page.goto('/movies?screeningRoom=1&media=movie-100');
  const trailer = page.getByRole('button', {name: 'Trailer', exact: true});
  await trailer.focus();
  await page.keyboard.press('Enter');
  const play = page.getByRole('button', {name: 'Play trailer'});
  await expect(play).toBeEnabled();
  await play.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as any).trailerCommands)).toEqual(['play', 'pause']);
  await page.keyboard.press('Escape');
  await expect(trailer).toBeFocused();
  await expect(page.getByRole('dialog', {name: 'Media Drawer'})).toBeVisible();
});

test('text settings can be edited with the on-screen keyboard and cancelled', async ({page}) => {
  await page.goto('/settings?screeningRoom=1&tab=omss');
  const field = page.locator('input#omss');
  await field.focus();
  const original = await field.inputValue();
  await page.keyboard.press('Enter');
  const input = page.getByRole('textbox', {name: 'Edit text'});
  await expect(input).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(input).not.toHaveValue(original);
  await page.keyboard.press('Escape');
  await expect(input).not.toBeVisible();
  await expect(field).toHaveValue(original);
  await expect(field).toBeFocused();
});


test('an early Play press survives provider startup and can be cancelled', async ({page}) => {
  await page.route('https://moviesapi.to/movie/100*', route => route.fulfill({contentType: 'text/html', body: `<script>
    window.ready=false; window.commands=[]; let paused=true;
    addEventListener('message', e=>{
      window.commands.push(e.data.action);
      if(!window.ready) return;
      if(e.data.action==='play') paused=false;
      if(e.data.action==='pause') paused=true;
      parent.postMessage({source:'moviesapi-player',event:'playerstatus',paused,currentTime:0,duration:600},'*');
    });
  </script>`}));
  await page.goto('/watch/movie/100?screeningRoom=1');
  const play = page.locator('[data-remote-default]');
  await expect(play).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Starting playback…');
  const provider = page.frames().find(frame => frame.url().startsWith('https://moviesapi.to/'))!;
  await provider.waitForFunction(() => (window as any).commands?.length >= 2);
  await provider.evaluate(() => { (window as any).ready = true; });
  await expect(play).toHaveAttribute('aria-label', 'Pause');
  await expect(play).toHaveAttribute('aria-busy', 'false');
  await page.keyboard.press('Enter');
  await expect(play).toHaveAttribute('aria-label', 'Play');
  await provider.evaluate(() => { (window as any).ready = false; (window as any).commands = []; });
  await page.keyboard.press('Enter');
  await expect(play).toHaveAttribute('aria-label', 'Cancel play');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Pausing playback…');
  await provider.evaluate(() => { (window as any).ready = true; (window as any).commands = []; });
  await expect(play).toHaveAttribute('aria-busy', 'false');
  expect(await provider.evaluate(() => (window as any).commands)).not.toContain('play');
});

test('a provider that never starts shows a retry message', async ({page}) => {
  await page.clock.install();
  await page.goto('/watch/movie/100?screeningRoom=1');
  const play = page.locator('[data-remote-default]');
  await expect(play).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(play).toHaveAttribute('aria-label', 'Cancel play');
  await page.clock.fastForward(21000);
  await expect(page.getByRole('status')).toContainText('The player did not respond.');
  await expect(play).toHaveAttribute('aria-label', 'Play');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Starting playback…');
});


test('NAS-style player controls match remote order, volume, fullscreen and auto-hide', async ({page}) => {
  await page.clock.install();
  await page.route('https://moviesapi.to/movie/100*', route => route.fulfill({contentType: 'text/html', body: `<style>body{background:#12171e}</style><script>
    window.commands=[]; let paused=true,time=30;
    addEventListener('message', e=>{window.commands.push(e.data); if(e.data.action==='play') paused=false; if(e.data.action==='pause') paused=true; if(e.data.action==='seek') time=e.data.time;
      parent.postMessage({source:'moviesapi-player',event:'playerstatus',paused,currentTime:time,duration:7200},'*');});
  </script>`}));
  await page.goto('/watch/movie/100?screeningRoom=1');
  const player = page.locator('.cinema-player');
  const play = page.locator('[data-remote-default]');
  await expect(play).toBeFocused();
  await expect(page.getByRole('heading', {name: 'Movie 1'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Back', exact: true})).toHaveCount(1);
  await expect(page.locator('.cinema-time')).toHaveText('0:30 / 2:00:00');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', {name: 'Rewind 10 seconds'})).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', {name: 'Forward 10 seconds'})).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', {name: 'Mute', exact: true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('slider', {name: 'Volume', exact: true})).toHaveValue('0');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('slider', {name: 'Volume', exact: true})).toHaveValue('1');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('slider', {name: 'Volume', exact: true})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('slider', {name: 'Volume', exact: true})).toHaveValue('0.95');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', {name: 'Quality', exact: true})).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', {name: 'Servers', exact: true})).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', {name: 'Audio & subtitles', exact: true})).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', {name: 'Fullscreen', exact: true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('slider', {name: 'Playback position'})).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('button', {name: 'Back', exact: true})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(play).toBeFocused();
  for (const width of [1920, 1280, 720]) {
    await page.setViewportSize({width, height: Math.round(width * 9 / 16)});
    await expect(page.getByRole('button', {name: 'Fullscreen', exact: true})).toBeInViewport();
    await expect(play).toBeInViewport();
    const bounds = await page.locator('.cinema-video').boundingBox();
    expect(bounds?.width).toBe(width);
    expect(bounds?.height).toBe(Math.round(width * 9 / 16));
    await page.screenshot({path: `.local/screenshots/cinepro-nas-player-${width}.png`});
  }
  await page.keyboard.press('Enter');
  await expect(play).toHaveAttribute('aria-label', 'Pause');
  await page.clock.fastForward(5000);
  await expect(player).toHaveAttribute('data-controls-visible', 'false');
  await expect(player).toBeFocused();
  await expect(page.getByRole('button', {name: 'Pause', exact: true})).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect(player).toHaveAttribute('data-controls-visible', 'true');
  await expect(play).toBeFocused();
  await page.keyboard.press('Space');
  await expect(play).toHaveAttribute('aria-label', 'Play');
  await page.clock.fastForward(5000);
  await expect(player).toHaveAttribute('data-controls-visible', 'true');
});


for (const route of ['/watch/movie/100', '/watch/tv/100?s=2&e=3']) {
  test(`Servers changes providers with the remote and preserves the media route: ${route}`, async ({page}) => {
    for (const host of ['vidlink.pro', 'vidfast.vc', 'www.rivestream.app']) await page.route(`https://${host}/**`, r => r.fulfill({contentType:'text/html', body:`<script>
      let paused=true;
      addEventListener('message', e=>{if(e.data.source!=='screening-room-control')return;
        if(e.data.action==='play')paused=false;if(e.data.action==='pause')paused=true;
        parent.postMessage({source:'screening-room-player',event:'playerstatus',paused,currentTime:0,duration:600},'*');});
    </script>`}));
    await page.goto(`${route}${route.includes('?') ? '&' : '?'}screeningRoom=1`);
    const servers = page.getByRole('button', {name:'Servers',exact:true});
    await servers.focus(); await page.keyboard.press('Enter');
    const menu = page.getByRole('dialog', {name:'Servers',exact:true});
    await expect(menu.getByRole('button',{name:'MoviesAPI',exact:true})).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('button',{name:'VidLink',exact:true})).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.cinema-video')).toHaveCount(1);
    await expect(page.locator('.cinema-video')).toHaveAttribute('src',route.includes('/tv/') ? /vidlink.pro\/tv\/100\/2\/3/ : /vidlink.pro\/movie\/100/);
    await expect(page.getByRole('button',{name:'Play',exact:true})).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeFocused();
    await servers.focus(); await page.keyboard.press('Enter');
    await expect(menu.getByRole('button',{name:'VidLink',exact:true})).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(servers).toBeFocused();
    await expect(page).toHaveURL(new RegExp(route.split('?')[0]));
    await page.getByRole('button',{name:'Fullscreen',exact:true}).focus(); await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await servers.focus(); await page.keyboard.press('Enter');
    await expect(menu).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await servers.focus(); await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('button',{name:'VidFast',exact:true})).toBeFocused();
    await page.screenshot({path: `.local/screenshots/cinepro-servers-${route.includes('/tv/') ? 'tv' : 'movie'}.png`});
    await page.keyboard.press('Enter');
    await expect(page.locator('.cinema-video')).toHaveAttribute('src', /vidfast.vc/);
    await expect(page.locator('.cinema-video')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await servers.focus(); await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('button',{name:'Rivestream',exact:true})).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.cinema-video')).toHaveAttribute('src', route.includes('/tv/')
      ? 'https://www.rivestream.app/embed?type=tv&id=100&season=2&episode=3'
      : 'https://www.rivestream.app/embed?type=movie&id=100');
    await expect(page.locator('.cinema-video')).toHaveCount(1);
    await expect(page.getByRole('button',{name:'Play',exact:true})).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeFocused();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await servers.focus(); await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
    await expect(page.locator('.cinema-video')).toHaveAttribute('src', /moviesapi.to/);
    await expect(page.locator('.cinema-video')).toHaveCount(1);
  });
}


test('a failed server keeps the remote picker available for recovery', async ({page}) => {
  await page.clock.install();
  await page.route('https://vidlink.pro/**', r=>r.fulfill({contentType:'text/html',body:`<script>let paused=true;addEventListener('message',e=>{if(e.data.source!=='screening-room-control')return;if(e.data.action==='play')paused=false;parent.postMessage({source:'screening-room-player',event:'playerstatus',paused,ready:false,currentTime:0,duration:0},'*')});</script>`}));
  await page.goto('/watch/movie/100?screeningRoom=1');
  const servers = page.getByRole('button',{name:'Servers',exact:true});
  await servers.focus(); await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(page.locator('.cinema-video')).toHaveAttribute('src',/vidlink.pro/);
  await page.getByRole('button',{name:'Play',exact:true}).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Starting playback…');
  await page.clock.fastForward(5000);
  await expect(page.getByRole('status')).toHaveText('Starting playback…');
  await page.clock.fastForward(21000);
  await expect(page.getByRole('status')).toContainText(/open Quality/i);
  await servers.focus(); await page.keyboard.press('Enter');
  const menu = page.getByRole('dialog',{name:'Servers',exact:true});
  await expect(menu.getByRole('button',{name:'VidLink',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
  await expect(page.locator('.cinema-video')).toHaveAttribute('src',/moviesapi.to/);
  await expect(page.locator('.cinema-video')).toHaveCount(1);
  await expect(page.getByRole('status')).not.toContainText('taking too long');
});

test('track picker changes provider captions and audio with remote navigation, including Off and fullscreen Back', async ({page}) => {
  await page.route('https://moviesapi.to/movie/100*', r => r.fulfill({contentType:'text/html', body:`
    <video></video>
    <div role="radiogroup" aria-label="Subtitles">
      <button role="menuitemradio" value="off" aria-checked="false">Off</button>
      <button role="menuitemradio" value=":subtitles-english" aria-checked="true">English</button>
      <button role="menuitemradio" value=":subtitles-spanish" aria-checked="false">Spanish</button>
    </div>
    <div role="radiogroup" aria-label="Audio">
      <button role="menuitemradio" value="original" aria-checked="true">Original audio</button>
      <button role="menuitemradio" value="description" aria-checked="false">Audio description</button>
    </div>
    <div role="radiogroup" aria-label="Quality"><button role="menuitemradio" value="1080">1080p</button></div>
    <script>
      for(const button of document.querySelectorAll('button')) button.onpointerup=()=>{
        for(const other of button.parentElement.children) other.setAttribute('aria-checked',String(other===button));
      };
      ${providerTrackScript}
    </script>`}));
  await page.goto('/watch/movie/100?screeningRoom=1');
  const trigger = page.getByRole('button',{name:'Audio & subtitles',exact:true});
  await expect(trigger).toBeEnabled();
  await trigger.focus(); await page.keyboard.press('Enter');
  const menu = page.getByRole('dialog',{name:'Audio & subtitles',exact:true});
  await expect(menu.getByRole('button',{name:'English',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(menu.getByRole('button',{name:'1080p',exact:true})).toHaveCount(0);
  await menu.getByRole('button',{name:'Original audio',exact:true}).focus();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('button',{name:'Audio description',exact:true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu.getByRole('button',{name:'Audio description',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('button',{name:'Off',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('button',{name:'Spanish',exact:true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu.getByRole('button',{name:'Spanish',exact:true})).toHaveAttribute('aria-pressed','true');
  const provider = page.frames().find(f=>f.url().startsWith('https://moviesapi.to/'))!;
  expect(await provider.locator('[value=":subtitles-spanish"]').getAttribute('aria-checked')).toBe('true');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
  await expect(menu.getByRole('button',{name:'Off',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await provider.locator('[value="off"]').getAttribute('aria-checked')).toBe('true');
  // A forged response from the parent page cannot replace the provider's list.
  await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://moviesapi.to',source:window,
    data:{source:'screening-room-tracks',audio:[],subtitles:[{id:'bad',label:'Forged',selected:true}]}})));
  await expect(menu.getByRole('button',{name:'Forged',exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await page.getByRole('button',{name:'Fullscreen',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await page.keyboard.press('s'); await expect(menu).toBeInViewport();
  await page.screenshot({path:'.local/screenshots/cinepro-tracks.png'});
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
});

test('track picker uses native text tracks and clears the list when switching servers', async ({page}) => {
  await page.route('https://moviesapi.to/movie/100*', r=>r.fulfill({contentType:'text/html',body:`<video></video><script>
    const video=document.querySelector('video'); video.addTextTrack('subtitles','French','fr');
    ${providerTrackScript}
    </script>`}));
  await page.route('https://vidlink.pro/**', r=>r.fulfill({contentType:'text/html',body:`<video></video><script>${providerTrackScript}</script>`}));
  await page.goto('/watch/movie/100?screeningRoom=1');
  const trigger=page.getByRole('button',{name:'Audio & subtitles',exact:true});
  await trigger.click();
  const menu=page.getByRole('dialog',{name:'Audio & subtitles',exact:true});
  await expect(menu).toContainText('This server exposes no alternate audio tracks.');
  await menu.getByRole('button',{name:'French',exact:true}).click();
  await expect(menu.getByRole('button',{name:'French',exact:true})).toHaveAttribute('aria-pressed','true');
  const provider=page.frames().find(f=>f.url().startsWith('https://moviesapi.to/'))!;
  expect(await provider.evaluate(()=>document.querySelector('video')!.textTracks[0].mode)).toBe('showing');
  await menu.getByRole('button',{name:'Off',exact:true}).click();
  await expect(menu.getByRole('button',{name:'Off',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await provider.evaluate(()=>document.querySelector('video')!.textTracks[0].mode)).toBe('disabled');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Servers',exact:true}).click();
  await page.getByRole('button',{name:'VidLink',exact:true}).click();
  await expect(page.locator('.cinema-video')).toHaveAttribute('src',/vidlink.pro/);
  await trigger.click();
  await expect(menu).toContainText('No tracks found yet. Start playback, then check again.');
  await expect(menu.getByRole('button',{name:'French',exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
});
