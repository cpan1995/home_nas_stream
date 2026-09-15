import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Lavish uses a sandboxed iframe, so the review is self-contained (no CORS).
const output = '.lavish/screening-room';
await fs.mkdir(output, { recursive: true });
const library = JSON.parse(await fs.readFile('.local/library.json', 'utf8'));
for (const movie of library.movies) {
  if (movie.image) movie.image = `data:image/jpeg;base64,${(await fs.readFile(fileURLToPath(movie.image))).toString('base64')}`;
}
const files = await fs.readdir('dist/assets');
let css = await fs.readFile(path.join('dist/assets', files.find(f => f.endsWith('.css'))), 'utf8');
for (const font of files.filter(f => /\.woff2?$/.test(f))) {
  const encoded = (await fs.readFile(path.join('dist/assets', font))).toString('base64');
  css = css.replaceAll(`./${font}`, `data:font/${font.endsWith('woff2') ? 'woff2' : 'woff'};base64,${encoded}`);
}
const script = await fs.readFile(path.join('dist/assets', files.find(f => f.endsWith('.js'))), 'utf8');
const snapshot = JSON.stringify(library).replaceAll('<', '\\u003c');
await fs.writeFile(path.join(output, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Screening Room review</title><style>${css}</style></head><body><div id="root"></div><script>window.__screeningReview=${snapshot};</script><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`);
console.log(`Self-contained review: ${output}/index.html`);
