import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const providers = JSON.parse(readFileSync('config/online-filter.json', 'utf8')).providerOrigins;
const adapter=(readFileSync('native/Main.qml','utf8').split('name: "screening-room-track-controls"')[1].split('sourceCode: `')[1].split('})();`')[0]+'})();').replace(/const allowedParent = .*;/,'const allowedParent = "http://127.0.0.1:5174";').replace('__SCREENING_ROOM_PROVIDERS__', JSON.stringify(providers));

// Structure follows the captured MUI player: subtitle language divs are inside
// a single button, alongside a separate settings button with a Subtitles value.
// Selection loads cues through the provider handler; changing mode alone does
// not load cues or update its caption renderer.
async function fixture(page: import('@playwright/test').Page, eager=true) {
  await page.route('**/vidfast-subtitle-fixture',r=>r.fulfill({contentType:'text/html',body:'<iframe src="https://vidfast.vc/movie/100"></iframe><script>window.replies=[];addEventListener("message",e=>window.replies.push(e.data))</script>'}));
  await page.route('https://vidfast.vc/movie/100*',r=>r.fulfill({contentType:'text/html',body:`
    <video></video><div id="caption" aria-live="polite"></div>
    <button id="subtitle-menu"><div><div>Customize</div><div>Upload Subtitles</div><div id="languages">
      <div data-choice="Off"><div>Off</div></div><div data-choice="English"><div>English</div></div><div data-choice="French"><div>French</div></div>
    </div></div></button>
    <button id="settings"><div><div><div>Playback speed</div><div>Normal</div></div><div><div>Subtitles</div><div id="selected">Off</div></div><div><div>Quality</div><div>1080p</div></div></div></button>
    <script>
      const video=document.querySelector('video');
      ${eager ? "video.addTextTrack('subtitles','English','en');video.addTextTrack('subtitles','French','fr');" : ''}
      for(const node of document.querySelectorAll('[data-choice]')) node.onclick=event=>{
        event.stopPropagation();const label=node.dataset.choice;
        for(const track of video.textTracks)track.mode='disabled';
        if(label!=='Off') {
          let track=[...video.textTracks].find(t=>t.label===label)||video.addTextTrack('subtitles',label,label==='French'?'fr':'en');
          if(!track.cues?.length)track.addCue(new VTTCue(0,60,label==='French'?'Bonjour':'Hello'));
          track.mode='hidden';
        }
        document.querySelector('#selected').textContent=label;
        document.querySelector('#caption').textContent=label==='Off'?'':label==='French'?'Bonjour':'Hello';
        // Provider re-renders the labels; commands must be recollected each time.
        for(const row of document.querySelectorAll('[data-choice]')) row.innerHTML='<div>'+row.dataset.choice+'</div>';
      };
      ${adapter}
    </script>`}));
  await page.goto('/vidfast-subtitle-fixture');
  const frame=page.frameLocator('iframe');await expect(frame.locator('video')).toHaveCount(1);
  const send=(action:string,id?:string)=>page.locator('iframe').evaluate((frame,data)=>(frame as HTMLIFrameElement).contentWindow!.postMessage(data,'https://vidfast.vc'),{source:'screening-room-track-control',action,id});
  const last=()=>page.evaluate(()=>(window as any).replies.findLast((r:any)=>r.source==='screening-room-tracks'));
  return {frame,send,last};
}

for(const eager of [true,false])test(`VidFast selections drive caption renderer, including Off and re-rendered rows (tracks ${eager?'present':'lazy'})`,async({page})=>{
  const {frame,send,last}=await fixture(page,eager);
  await send('getTracks');
  await expect.poll(async()=>(await last())?.subtitles.map((s:any)=>s.label)).toEqual(['English','French']);
  for(const [language,caption] of [['English','Hello'],['French','Bonjour'],['Off','']]) {
    await send('selectTrack',language==='Off'?'sub:off':`sub:vidfast:${language}`);
    await expect(frame.locator('#caption')).toHaveText(caption);
    await expect.poll(async()=>(await last())?.subtitles.filter((s:any)=>s.selected).map((s:any)=>s.label)).toEqual(language==='Off'?[]:[language]);
  }
});

test('VidFast does not claim success from a browser track flag when provider menu is missing',async({page})=>{
  const {frame,send,last}=await fixture(page);
  await frame.locator('#subtitle-menu').evaluate(e=>e.remove());
  await frame.locator('video').evaluate(v=>{(v as HTMLVideoElement).textTracks[0].mode='showing'});
  await send('getTracks');
  await expect.poll(async()=>(await last())?.subtitles.some((s:any)=>s.selected)).toBe(false);
  await send('selectTrack','sub:native:0');
  await expect.poll(async()=>(await last())?.error).toBe('This server could not change the track.');
  await expect(frame.locator('#caption')).toBeEmpty();
});


test('VidFast confirms a loaded caption track when another settings submenu hides the summary',async({page})=>{
  const {frame,send,last}=await fixture(page);
  await frame.locator('#settings').evaluate(e=>e.style.display='none');
  // Selection still uses the provider action; the summary disappears afterward.
  await send('selectTrack','sub:vidfast:French');
  await expect(frame.locator('#caption')).toHaveText('Bonjour');
  await frame.locator('#settings').evaluate(e=>e.remove());
  await send('getTracks');
  await expect.poll(async()=>(await last())?.subtitles.filter((s:any)=>s.selected).map((s:any)=>s.label)).toEqual(['French']);
});


test('TV subtitle picker confirms VidFast caption selection and restores focus',async({page})=>{
  await fixture(page);
  await page.route('**/api/anime/resolve/**',r=>r.fulfill({json:{match:null}}));
  await page.route('**/api/tmdb/**',r=>r.fulfill({json:{id:100,title:'VidFast subtitle check',runtime:90,release_date:'2025-01-01',genres:[],images:{logos:[]},videos:{results:[]},credits:{cast:[]},recommendations:{results:[]}}}));
  for(const host of ['moviesapi.to','vidlink.pro','player.cinezo.live','www.rivestream.app'])await page.route(`https://${host}/**`,r=>r.fulfill({contentType:'text/html',body:''}));
  await page.goto('/watch/movie/100?screeningRoom=1');
  await page.getByRole('button',{name:'Servers',exact:true}).click();
  await page.getByRole('dialog',{name:'Servers',exact:true}).getByRole('button',{name:'VidFast',exact:true}).click();
  const trigger=page.getByRole('button',{name:'Audio & subtitles',exact:true});await trigger.click();
  const menu=page.getByRole('dialog',{name:'Audio & subtitles',exact:true});
  await menu.getByRole('button',{name:'French',exact:true}).click();
  await expect(menu.getByRole('button',{name:'French',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.frameLocator('.cinema-video').locator('#caption')).toHaveText('Bonjour');
  await page.screenshot({path:'.local/screenshots/vidfast-subtitle-picker.png'});
  await menu.getByRole('button',{name:'Off',exact:true}).click();
  await expect(page.frameLocator('.cinema-video').locator('#caption')).toBeEmpty();
  await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
});
