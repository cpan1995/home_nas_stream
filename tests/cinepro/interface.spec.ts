import { test, expect } from '@playwright/test';

for (const size of [{width:1920,height:1080},{width:3840,height:2160}]) {
  test(`existing catalogue screens at ${size.width}x${size.height}`, async ({page}) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    const errors:string[]=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',e=>{if(e.type()==='error') errors.push(e.text())});
    for(const path of ['/', '/movies', '/shows', '/discover', '/settings']) {
      await page.goto(path);
      await expect(page.getByRole('link',{name:'Home',exact:true})).toBeVisible();
      if (['/','/movies','/shows'].includes(path)) await expect(page.getByRole('button',{name:'Learn more',exact:true}).first()).toBeVisible();
      if(path==='/discover') {
        await expect(page.getByRole('button',{name:'Next',exact:true})).toBeEnabled();
        await page.getByRole('button',{name:'Next',exact:true}).click();
        await expect(page.getByText(/Page 2 of/)).toBeVisible();
      }
      if(path==='/settings') await expect(page.getByRole('tab').first()).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.filter(i=>i.getBoundingClientRect().top<innerHeight).map(i=>(i as HTMLImageElement).complete?Promise.resolve():new Promise(resolve=>{i.addEventListener('load',resolve,{once:true});i.addEventListener('error',resolve,{once:true});setTimeout(resolve,5000)}))));
      await page.screenshot({path:`.local/screenshots/cinepro-${path.slice(1)||'home'}-${size.width}.png`});
    }
    expect(errors).toEqual([]);
  });
}

test('search, movie details, TV seasons and episodes',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/search/i}).click();
  const input=page.getByRole('textbox');
  await input.fill('Top Gun Maverick');
  await page.getByRole('option',{name:/Top Gun: Maverick/}).first().click();
  const drawer=page.getByRole('dialog',{name:'Media Drawer'});
  await expect(drawer.getByRole('button',{name:'Play',exact:true})).toBeVisible();
  await page.screenshot({path:'.local/screenshots/cinepro-details.png'});
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/?media=tv-1396');
  await expect(page.getByRole('heading',{name:'Episodes',exact:true})).toBeVisible();
  await page.getByRole('heading',{name:'Episodes',exact:true}).scrollIntoViewIfNeeded();
  await page.getByRole('dialog',{name:'Media Drawer'}).getByRole('combobox').click();
  await page.getByRole('option',{name:'Season 1',exact:true}).click();
  await expect(page.getByText('Pilot',{exact:true})).toBeVisible();
  await page.screenshot({path:'.local/screenshots/cinepro-episodes.png'});
});

test('local API rejects unrelated endpoints and cross-site requests',async({request})=>{
  expect((await request.get('/api/local/health')).status()).toBe(200);
  expect((await request.get('/api/cinepro/v1/health')).status()).toBe(200);
  expect((await request.get('/api/cinepro/v1/proxy?url=http://localhost')).status()).toBe(404);
  expect((await request.get('/api/media/unknown')).status()).toBe(410);
  expect((await request.get('/api/tmdb/3/account')).status()).toBe(404);
  expect((await request.get('/api/local/health',{headers:{Origin:'https://example.com'}})).status()).toBe(403);
  expect((await request.get('/api/anime/resolve/tv/100?season=-1&episode=1')).status()).toBe(400);
  expect((await request.get('/api/anime/resolve/tv/100?season=1&episode=0')).status()).toBe(400);
  expect((await request.get('/api/anime/resolve/tv/100',{headers:{Origin:'https://example.com'}})).status()).toBe(403);
});
