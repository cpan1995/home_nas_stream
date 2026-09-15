import { test, expect, type Page } from '@playwright/test'
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const providers = JSON.parse(readFileSync('config/online-filter.json', 'utf8')).providerOrigins
const adapter = readFileSync('native/quality-adapter.js', 'utf8')
    .replace('__SCREENING_ROOM_ORIGIN__', JSON.stringify('http://127.0.0.1:5174'))
    .replace('__SCREENING_ROOM_PROVIDERS__', JSON.stringify(providers))
const fixtureDir = path.resolve('.local/quality-fixtures')
test.beforeAll(() => {
    mkdirSync(fixtureDir, { recursive: true })
    for (const height of [720, 1080]) {
        const file = path.join(fixtureDir, `${height}.mp4`)
        if (existsSync(file)) continue
        const result = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${height === 720 ? 'blue' : 'green'}:s=${height * 16 / 9}x${height}:r=24`, '-t', '20', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', file], { encoding: 'utf8' })
        if (result.status) throw Error(result.stderr)
    }
})

export async function fixtures(page: Page, state = { working: true }, lazyVidFast = false) {
    // Model Qt injecting before an iframe receives its browsing-context name.
    await page.addInitScript(lazyVidFast ? "window.name = '';\n" + adapter : adapter)
    await page.route('**/api/anime/resolve/**', route => route.fulfill({ json: { match: null } }))
    await page.route('**/api/tmdb/**', route => {
        const u = new URL(route.request().url())
        const json = u.pathname.endsWith('/configuration') ? { images: { secure_base_url: 'https://image.tmdb.org/t/p/', poster_sizes: ['original'], backdrop_sizes: ['original'], logo_sizes: ['original'], still_sizes: ['original'] } } :
            { id: 100, title: 'Quality playback check', name: 'Quality playback check', release_date: '2026-01-01', overview: 'Locally generated video.', runtime: 20, genres: [], images: { logos: [], backdrops: [], posters: [] }, videos: { results: [] }, credits: { cast: [] }, recommendations: { results: [] }, results: [] }
        return route.fulfill({ json })
    })
    for (const host of ['moviesapi.to', 'vidfast.vc', 'vidlink.pro', 'player.cinezo.live', 'www.rivestream.app', 'anixo.buzz']) {
        await page.route(`https://${host}/**`, route => {
            const pathname = new URL(route.request().url()).pathname
            const match = /^\/(720|1080)\.mp4$/.exec(pathname)
            if (match) return route.fulfill({ contentType: 'video/mp4', path: path.join(fixtureDir, `${match[1]}.mp4`) })
            if (pathname === '/missing.mp4') return route.fulfill({ status: 404, body: 'Missing video' })
            const works = state.working && ['moviesapi.to', 'vidfast.vc'].includes(host)
            const height = host === 'moviesapi.to' ? 1080 : 720
            return route.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0;background:black">
                <video loop preload="auto" playsinline style="width:100%;height:100%" src="/${works ? height : 'missing'}.mp4"></video>
                ${host === 'moviesapi.to' ? '<button role="menuitemradio" aria-checked="true">1080p</button><button role="menuitemradio" aria-checked="false">720p</button>' : '<button role="menuitemradio">2160p</button>'}
                <script>
                const v=document.querySelector('video');
                for(const b of document.querySelectorAll('button')) b.onclick=()=>{
                    if(${JSON.stringify(host)}!=='moviesapi.to')return;
                    const playing=!v.paused,time=v.currentTime;
                    for(const other of document.querySelectorAll('button'))other.setAttribute('aria-checked',String(other===b));
                    v.src='/'+parseInt(b.textContent)+'.mp4';v.currentTime=time;if(playing)v.play().catch(()=>{});
                };
                const status=(event='playerstatus')=>parent.postMessage({source:${JSON.stringify(host === 'moviesapi.to' ? 'moviesapi-player' : 'screening-room-player')},event,ready:v.readyState>0,paused:v.paused,currentTime:v.currentTime,duration:Number.isFinite(v.duration)?v.duration:0},'http://127.0.0.1:5174');
                addEventListener('message',e=>{
                    if(e.data.source==='screening-room-quality-control')return;
                    const a=e.data.action;
                    if(a==='play')v.play().catch(()=>{});if(a==='pause')v.pause();if(a==='seek')v.currentTime=e.data.time;
                    if(a==='setVolume'){v.volume=e.data.volume;v.muted=v.volume===0;}status();
                });
                for(const e of ['play','pause','seeked','error'])v.addEventListener(e,()=>status(e));setInterval(()=>status(),250);
                ${lazyVidFast && host === 'vidfast.vc' ? `
                setTimeout(()=>{
                document.querySelectorAll('button').forEach(b=>b.remove());
                const settings=document.createElement('button');
                settings.innerHTML='<div><div>Playback speed</div><div id="quality-row"><div><div>Quality</div><div>720p</div></div></div></div>';
                document.body.append(settings);
                document.querySelector('#quality-row').onclick=()=>{
                  settings.innerHTML='<div><div>Quality</div><div data-height="1080"><div>1080p</div></div><div data-height="720"><div>720p</div></div></div>';
                  for(const row of settings.querySelectorAll('[data-height]'))row.onclick=()=>{v.src='/'+row.dataset.height+'.mp4';v.play().catch(()=>{});};
                };
                }, 1000);
                ` : ''}
                </script>` })
        })
    }
}
export const active = (page: Page) => page.frameLocator('.cinema-video').locator('video')
export async function quality(page: Page) {
    await page.mouse.move(400, 300)
    await page.mouse.move(450, 310)
    await page.getByRole('button', { name: 'Quality', exact: true }).click()
    return page.getByRole('dialog', { name: 'Quality', exact: true })
}
