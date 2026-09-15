import { test, expect, type Page } from '@playwright/test';
import { tvFixtures } from './tv-browsing-fixtures';

async function visibleFocus(page: Page) {
  const box = await page.locator(':focus').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 2);
}

test.beforeEach(async ({page}) => tvFixtures(page));

for (const width of [1280, 1920, 3840]) test(`TV navigation and rails at ${width}`, async ({page}) => {
  await page.setViewportSize({width, height: width * 9 / 16});
  await page.goto('/movies?screeningRoom=1');
  const nav = page.getByRole('navigation', {name:'Main navigation'});
  await expect(nav.getByRole('link',{name:'Movies',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(nav.getByRole('link',{name:'TV Shows',exact:true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/shows/);
  await expect(page.locator('[data-remote-card]').first()).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await visibleFocus(page);
  const rail = page.locator('[data-remote-rail]').first();
  const cards = rail.locator('[data-remote-card]');
  // Seed a row once, then navigate beyond its original visible viewport using only arrows.
  await cards.first().focus();
  for (let i=0;i<8;i++) await page.keyboard.press('ArrowRight');
  await expect(cards.nth(8)).toBeFocused();
  await visibleFocus(page);
  const x = (await cards.nth(8).boundingBox())!.x;
  expect(x).toBeGreaterThanOrEqual(0);
  expect(x).toBeLessThan(width);
  await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Media Drawer'});
  await expect(dialog.getByRole('button',{name:'Play',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(cards.nth(8)).toBeFocused();
  await visibleFocus(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`.local/screenshots/cinepro-tv-rails-${width}.png`});
});

test('featured buttons work with OK and do not leave focus on a hidden slide', async ({page}) => {
  await page.goto('/movies?screeningRoom=1');
  const next=page.getByRole('button',{name:'Next featured',exact:true});
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tv-feature-controls')).toContainText('2 /');
  await expect(next).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button',{name:'Previous featured'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tv-feature-controls')).toContainText('1 /');
  await page.screenshot({path:'.local/screenshots/cinepro-tv-home.png'});
});

test('episode list follows Down, season menu closes with Back, details restore the card', async ({page}) => {
  await page.goto('/shows?screeningRoom=1');
  const card=page.locator('[data-remote-rail]').first().locator('[data-remote-card]').first();
  await card.focus(); await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Media Drawer'});
  const season=dialog.getByRole('combobox',{name:'Season'});
  await season.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('option',{name:'Season 1',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option',{name:'Season 2',exact:true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(season).toContainText('Season 2');
  await expect(season).toBeFocused();
  const episodes=dialog.locator('.tv-episode-list [role="button"]');
  await episodes.first().focus();
  await expect(episodes.first()).toBeFocused();
  for(let i=0;i<10;i++) { await page.keyboard.press('ArrowDown'); await expect(episodes.nth(i+1)).toBeFocused(); }
  await expect(episodes.nth(10)).toBeFocused();
  await visibleFocus(page);
  await page.screenshot({path:'.local/screenshots/cinepro-tv-episodes.png'});
  await page.keyboard.press('Escape');
  await expect(card).toBeFocused();
});

test('Discover grid and menus work with arrows and Back', async ({page}) => {
  await page.goto('/discover?screeningRoom=1');
  const genres=page.getByRole('button',{name:/All Genres|Genres \(\d+\)/});
  await genres.focus(); await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(genres).toBeFocused();
  const cards=page.locator('[data-remote-grid] [data-remote-card]');
  await cards.first().focus(); await page.keyboard.press('ArrowDown');
  await expect(cards.nth(5)).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(cards.nth(6)).toBeFocused();
  await page.keyboard.press('ArrowUp'); await expect(cards.nth(1)).toBeFocused();
  await page.screenshot({path:'.local/screenshots/cinepro-tv-discover.png'});
});

test('Search and Settings can be reached and left with only the remote', async ({page}) => {
  await page.goto('/movies?screeningRoom=1');
  await expect(page.getByRole('navigation').getByRole('link',{name:'Movies',exact:true})).toBeFocused();
  for(let i=0;i<3;i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button',{name:'Search',exact:true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-remote-input]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-remote-keyboard] button').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-remote-input]')).toHaveValue('Q');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Search',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/settings/);
  await expect(page.getByRole('tab').first()).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link',{name:'Settings',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('tab').first()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab').nth(1)).toBeFocused();
  await visibleFocus(page);
  await page.screenshot({path:'.local/screenshots/cinepro-tv-settings.png'});
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/movies/);
});
