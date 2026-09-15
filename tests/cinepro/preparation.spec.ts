import { test, expect, type Page } from '@playwright/test'
import { fixtures, active, quality } from './quality-fixtures'

async function metadata(page: Page, waitForMovie: Promise<void> = Promise.resolve()) {
    await page.route('**/api/tmdb/**', async route => {
        const path = new URL(route.request().url()).pathname
        if (path.includes('/movie/100')) await waitForMovie
        const id = Number(/\/(?:movie|tv)\/(\d+)/.exec(path)?.[1] || 100)
        const episode = /\/season\/(\d+)\/episode\/(\d+)/.exec(path)
        const season = /\/season\/(\d+)/.exec(path)
        const base = { id, title: `Movie ${id}`, name: `Show ${id}`, release_date: '2020-01-01', first_air_date: '2020-01-01', overview: 'Playback preparation fixture', runtime: 24, episode_run_time: [24], genres: [],
            images: { logos: [], backdrops: [], posters: [] }, videos: { results: [] }, credits: { cast: [] }, recommendations: { results: [] }, seasons: [{ season_number: 1, id: 1, name: 'Season 1', episode_count: 5 }, { season_number: 2, id: 2, name: 'Season 2', episode_count: 3 }] }
        let json: unknown = base
        if (path.endsWith('/configuration')) json = { images: { secure_base_url: 'https://image.tmdb.org/t/p/', poster_sizes: ['original'], backdrop_sizes: ['original'], logo_sizes: ['original'], still_sizes: ['original'] } }
        else if (episode) json = { id: Number(episode[2]), season_number: Number(episode[1]), episode_number: Number(episode[2]), name: `Episode ${episode[2]}`, air_date: '2020-01-01' }
        else if (season) json = { id: Number(season[1]), episodes: Array.from({ length: Number(season[1]) === 1 ? 5 : 3 }, (_, i) => ({ id: i + 1, episode_number: i + 1, name: `Episode ${i + 1}`, air_date: Number(season[1]) === 2 && i === 2 ? '2999-01-01' : '2020-01-01' })) }
        else if (!/\/(movie|tv)\/\d+$/.test(path)) json = { results: [], genres: [], page: 1, total_pages: 1 }
        await route.fulfill({ json })
    })
}

test('selecting a title checks streams before metadata loads and Play keeps the in-flight checker', async ({ page }) => {
    await fixtures(page, { working: true }, true)
    let releaseMetadata!: () => void, releaseVideo!: () => void
    const metadataReady = new Promise<void>(resolve => { releaseMetadata = resolve })
    const videoReady = new Promise<void>(resolve => { releaseVideo = resolve })
    await metadata(page, metadataReady)
    await page.route('https://vidfast.vc/1080.mp4', async route => { await videoReady; await route.fallback() })
    const animeRequests: string[] = []
    page.on('request', request => { if (request.url().includes('/api/anime/resolve/movie/100')) animeRequests.push(request.url()) })
    try {
        await page.goto('/movies?screeningRoom=1&media=movie-100')
        const probe = page.locator('.cinema-quality-probe')
        await expect(probe).toHaveAttribute('src', /vidfast.*100/)
        await probe.evaluate(frame => { frame.dataset.retained = 'yes' })
        await expect(page.getByRole('status').filter({ hasText: /Ready to play/ })).toBeVisible()
        releaseMetadata()
        const drawer = page.getByRole('dialog', { name: 'Media Drawer' })
        await drawer.getByRole('button', { name: 'Play', exact: true }).click()
        await expect(page).toHaveURL(/\/watch\/movie\/100/)
        await expect(probe).toHaveAttribute('data-retained', 'yes')
        await expect(page.locator('.cinema-video')).toHaveAttribute('src', /vidfast/)
        await expect.poll(() => active(page).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0)
        expect(animeRequests).toHaveLength(1)
        const menu = await quality(page)
        await expect(menu.getByRole('radio', { name: /^Auto/ })).toHaveAttribute('aria-checked', 'true')
    } finally { releaseMetadata(); releaseVideo() }
})

test('TV preloads only two upcoming episodes, resets Auto on Next, and keeps fullscreen for episode selection', async ({ page }) => {
    test.setTimeout(100000)
    await fixtures(page, { working: true }, true)
    await metadata(page)
    const requested = new Set<string>()
    page.on('request', request => {
        const episode = /vidfast\.vc\/tv\/300\/(\d+)\/(\d+)/.exec(request.url())
        if (episode) requested.add(`${episode[1]}:${episode[2]}`)
    })
    await page.addInitScript(() => {
        (window as any).maxCheckers = 0
        new MutationObserver(() => { (window as any).maxCheckers = Math.max((window as any).maxCheckers, document.querySelectorAll('.cinema-quality-probe').length) }).observe(document, { childList: true, subtree: true })
    })
    await page.goto('/watch/tv/300?s=1&e=1&screeningRoom=1')
    const menu = await quality(page)
    await menu.getByRole('radio', { name: /^720p/ }).click()
    await expect.poll(() => active(page).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0)
    await expect.poll(() => requested.has('1:3'), { timeout: 45000 }).toBe(true)
    await expect(page.locator('.cinema-quality-probe')).toHaveCount(0)
    expect([...requested].sort()).toEqual(['1:1', '1:2', '1:3'])
    expect(await page.evaluate(() => (window as any).maxCheckers)).toBe(1)
    await page.mouse.move(300, 300)
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click()
    await page.getByRole('button', { name: 'Next episode', exact: true }).click()
    await expect(page).toHaveURL(/s=1&e=2/)
    await expect(page.locator('.cinema-heading')).toContainText('Episode 2')
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true)
    await expect.poll(() => active(page).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0)
    const nextMenu = await quality(page)
    await expect(nextMenu.getByRole('radio', { name: /^Auto/ })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Episodes', exact: true }).click()
    const episodes = page.getByRole('dialog', { name: 'Episodes', exact: true })
    const season = episodes.getByRole('combobox', { name: 'Episode season' })
    await season.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('option', { name: 'Season 1', exact: true })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('option', { name: 'Season 2', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(episodes.getByRole('button', { name: /Episode 3:/ })).toHaveAttribute('aria-disabled', 'true')
    await page.screenshot({ path: '.local/screenshots/player-episode-picker.png' })
    await season.focus()
    await page.keyboard.press('ArrowDown')
    await expect(episodes.getByRole('button', { name: /^Episode 1:/ })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(episodes.getByRole('button', { name: /^Episode 2:/ })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/s=2&e=2/)
    await expect(page.locator('.cinema-heading')).toContainText('Season 2 · Episode 2')
    await expect(page.getByRole('button', { name: 'Next episode', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Quality', exact: true })).toContainText('Auto')
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true)
    await page.keyboard.press('f')
    for (const width of [1280, 720]) {
        await page.setViewportSize({ width, height: 720 })
        await page.mouse.move(350, 300)
        await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toBeInViewport()
        await expect(page.getByRole('button', { name: 'Episodes', exact: true })).toBeInViewport()
    }
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.locator('.cinema-quality-probe')).toHaveCount(0)
    expect(requested.has('2:3')).toBe(false)
})
