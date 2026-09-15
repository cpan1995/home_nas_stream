import type { Page } from '@playwright/test';

export async function tvFixtures(page: Page) {
  await page.addInitScript(() => { sessionStorage.setItem('screeningRoom', '1'); localStorage.setItem('i18nextLng', 'en'); });
  const items = Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, title: `Movie ${i + 1}`, name: `Show ${i + 1}`, poster_path: '/poster.svg', backdrop_path: '/poster.svg', release_date: '2025-01-01', first_air_date: '2025-01-01', vote_average: 8.1, vote_count: 400, overview: 'A story of friendship and adventure across distant cities.', original_language: 'en' }));
  await page.route('**/api/tmdb/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let json: unknown = { results: items, page: Number(url.searchParams.get('page') || 1), total_pages: 3, total_results: 60 };
    if (path.endsWith('/configuration')) json = { images: { secure_base_url: 'https://image.tmdb.org/t/p/', poster_sizes: ['original'], backdrop_sizes: ['original'], logo_sizes: ['original'], still_sizes: ['original'], profile_sizes: ['original'] } };
    else if (path.endsWith('/countries')) json = [{iso_3166_1: 'US', english_name: 'United States', native_name: 'United States'}];
    else if (path.endsWith('/languages')) json = [{iso_639_1: 'en', english_name: 'English', name: 'English'}];
    else if (path.includes('/genre/')) json = { genres: [{ id: 28, name: 'Action' }, { id: 35, name: 'Comedy' }] };
    else if (path.includes('/watch/providers/')) json = { results: [{provider_id: 1, provider_name: 'Example', logo_path: '/poster.svg'}] };
    else if (/\/season\/\d+$/.test(path)) json = { id: 1, episodes: Array.from({length: 12}, (_, i) => ({ id: i + 1, episode_number: i + 1, name: `Episode ${i + 1}`, still_path: '/poster.svg', overview: items[0].overview, air_date: '2025-01-01', runtime: 40 })) };
    else if (/\/(movie|tv)\/\d+$/.test(path)) {
      const id = Number(path.split('/').pop());
      json = { ...items.find(i => i.id === id) || items[0], id, runtime: 120, genres: [{id:28,name:'Action'}], images: {logos:[{file_path:'/logo.svg'}],backdrops:[{file_path:'/poster.svg'}],posters:[]}, videos: {results:[]}, credits: {cast:Array.from({length:10},(_,i)=>({id:i,name:`Actor ${i+1}`,character:`Character ${i+1}`,profile_path:'/poster.svg'}))}, recommendations: {results:items.slice(1,9)}, episode_run_time:[40], seasons:[{id:1,name:'Season 1',season_number:1,episode_count:12},{id:2,name:'Season 2',season_number:2,episode_count:12}] };
    } else if (path.includes('/search/')) json = { results: [{ ...items[0], media_type: 'movie' }] };
    return route.fulfill({ json });
  });
  await page.route('**/api/anime/**', route => route.fulfill({json:{sources:[],status:'unmatched'}}));
  await page.route('https://image.tmdb.org/**', route => route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><defs><linearGradient id="a" x2="1" y2="1"><stop stop-color="#173e65"/><stop offset="1" stop-color="#33263f"/></linearGradient></defs><rect width="600" height="900" fill="url(#a)"/><circle cx="380" cy="260" r="140" fill="#6f90a0" opacity=".35"/></svg>'}));
  // No third-party players are needed to verify browsing.
  await page.route(/https:\/\/(?!image\.tmdb\.org)/, route => route.abort());
}
