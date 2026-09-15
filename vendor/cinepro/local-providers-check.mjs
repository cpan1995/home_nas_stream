import { writeFile } from 'node:fs/promises';
import { installNetworkGuard } from './local-network.mjs';
import { exposeEmbedUrls } from './dist/lib/documented-embed-provider.js';

installNetworkGuard(process.env.TMDB_READ_ACCESS_TOKEN);
const id = process.argv[2] ?? '634649';
if (!/^[1-9]\d*$/.test(id)) throw new Error('Provide a numeric TMDB movie ID');
const names = ['vidlink', 'moviesapi', 'vidfast', 'vidplus', 'superembed', 'ezvidapi'];
const results = await Promise.all(names.map(async name => {
  const module = await import(`./dist/providers/${name}/${name}.js`);
  const Provider = Object.values(module)[0];
  const provider = new Provider();
  const started = Date.now();
  const result = exposeEmbedUrls(await provider.getMovieSources({ type: 'movie', tmdbId: id, title: '', releaseYear: '', imdbId: '' }));
  const record = { provider: provider.name, seconds: Math.round((Date.now() - started) / 1000), ...result };
  console.log(JSON.stringify(record));
  return record;
}));
await writeFile(`/results/additional-providers-${id}.json`, JSON.stringify({ checkedAt: new Date().toISOString(), movieId: id, results }, null, 2), { mode: 0o600 });
