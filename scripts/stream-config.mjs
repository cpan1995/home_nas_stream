import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const secretKeys = ['TMDB_READ_ACCESS_TOKEN', 'TMDB_API_KEY', 'LOCAL_API_TOKEN', 'CINEPRO_API_TOKEN'];
const privateKeys = [...secretKeys, 'CINEPRO_API_URL'];
const fields = ['NAME', 'ORIGIN', 'MOVIE_PATH', 'TV_PATH', 'ANIME_PATH', 'LANGUAGES', 'ANIME_ISSUE', 'MANUAL_ANIME', 'AUTO_VARIANTS', 'SINGLE_AUDIO', 'ENABLED'];
const tokens = { id: '[1-9][0-9]*', season: '[1-9][0-9]*', episode: '[1-9][0-9]*', language: '(sub|dub)', dub: '(true|false)' };
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function pattern(value) {
  return value.split(/(\{[a-z]+\})/).map((part) => part.startsWith('{') ? tokens[part.slice(1, -1)] : escapeRegex(part)).join('');
}

async function optionalEnv(filename) {
  try { return parseEnv(await readFile(filename, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw Error(`Could not read configuration file: ${filename}`); }
}
function checkUrl(key, value, { origin = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw Error(`Invalid URL in ${key}`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port ||
      (origin && (url.pathname !== '/' || url.search)) ||
      [...url.searchParams.keys()].some((name) => /key|token|secret|auth|password/i.test(name))) throw Error(`Unsafe URL in ${key}; credentials must be separate server-side settings`);
  return origin ? url.origin : value;
}
function checkTemplate(key, value) {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('#') || /[\r\n\\]/.test(value)) throw Error(`Invalid path template in ${key}`);
  const matches = [...value.matchAll(/\{([^}]+)\}/g)];
  if (matches.some((match) => !Object.hasOwn(tokens, match[1])) || /[{}]/.test(value.replace(/\{[^}]+\}/g, ''))) throw Error(`Unknown placeholder in ${key}`);
  const sample = value.replace(/\{(id|season|episode)\}/g, '1').replaceAll('{language}', 'sub').replaceAll('{dub}', 'false');
  checkUrl(key, `https://template.invalid${sample}`);
  const parsed = new URL(sample, 'https://template.invalid');
  if (parsed.origin !== 'https://template.invalid' || /(?:^|\/)\.{1,2}(?:\/|$)/.test(sample.split('?')[0])) throw Error(`Invalid path template in ${key}`);
  const names = [...parsed.searchParams.keys()];
  if (new Set(names).size !== names.length) throw Error(`Duplicate query keys in ${key}`);
  return value;
}
function bool(key, value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  if (!['true', 'false'].includes(value)) throw Error(`${key} must be true or false`);
  return value === 'true';
}

export async function loadStreamConfig({ root = projectRoot, env = process.env, defaultsOnly = false } = {}) {
  const defaults = parseEnv(await readFile(path.join(root, 'config/stream-providers.env.example'), 'utf8'));
  const privateFile = path.join(root, '.local/stream-providers.env');
  const privateValues = defaultsOnly ? {} : await optionalEnv(privateFile);
  const values = { ...defaults, ...privateValues };
  if (!defaultsOnly) for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('STREAM_') || privateKeys.includes(key)) values[key] = value;
  }
  for (const key of Object.keys(values)) {
    if (!key.startsWith('STREAM_') && !privateKeys.includes(key)) throw Error(`Unknown stream configuration key: ${key}`);
    if (/[\r\n\0]/.test(values[key])) throw Error(`Multiline values are not supported: ${key}`);
  }
  const ids = values.STREAM_PROVIDER_IDS?.split(',').map((value) => value.trim()) || [];
  if (!ids.length || ids.length > 64 || new Set(ids).size !== ids.length || ids.some((id) => !/^[a-z0-9]+$/.test(id))) throw Error('Invalid STREAM_PROVIDER_IDS');
  const publicSettings = {};
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith('STREAM_')) continue;
    if (/API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key)) throw Error(`Private credentials cannot use public STREAM_ settings: ${key}`);
    if (key.startsWith('STREAM_CORE_') || /^https?:/.test(value)) {
      for (const endpoint of value.split(',')) checkUrl(key, endpoint);
    }
    publicSettings[key] = value;
  }
  const providers = ids.map((id) => {
    const prefix = `STREAM_${id.toUpperCase()}_`;
    const value = (field) => values[prefix + field];
    if (!value('NAME') || value('NAME').length > 100) throw Error(`Missing or invalid ${prefix}NAME`);
    const origin = value('ORIGIN') === '@local' && id === 'miruro' ? '@local' : checkUrl(prefix + 'ORIGIN', value('ORIGIN'), { origin: true });
    const provider = { id, name: value('NAME'), origin, enabled: bool(prefix + 'ENABLED', value('ENABLED'), true) };
    for (const [field, property] of [['MOVIE_PATH', 'moviePath'], ['TV_PATH', 'tvPath'], ['ANIME_PATH', 'animePath']]) {
      if (value(field)) provider[property] = checkTemplate(prefix + field, value(field));
    }
    if (!provider.moviePath && !provider.tvPath && !provider.animePath) throw Error(`No routes configured for ${id}`);
    provider.languages = (value('LANGUAGES') || 'sub,dub').split(',');
    provider.autoVariants = (value('AUTO_VARIANTS') || '').split(',').filter(Boolean);
    if ([...provider.languages, ...provider.autoVariants].some((language) => !['sub', 'dub'].includes(language))) throw Error(`Invalid languages for ${id}`);
    provider.manualAnime = bool(prefix + 'MANUAL_ANIME', value('MANUAL_ANIME'));
    provider.singleAudio = bool(prefix + 'SINGLE_AUDIO', value('SINGLE_AUDIO'));
    provider.animeIssue = value('ANIME_ISSUE') || '';
    if (provider.animeIssue.length > 200) throw Error(`Issue description too long for ${id}`);
    return provider;
  });
  const allowedPublic = new Set(['STREAM_PROVIDER_IDS', 'STREAM_MIRURO_ORIGINS', 'STREAM_MIRURO_REFERER']);
  for (const id of ids) for (const field of fields) allowedPublic.add(`STREAM_${id.toUpperCase()}_${field}`);
  for (const key of Object.keys(defaults)) if (key.startsWith('STREAM_CORE_')) allowedPublic.add(key);
  for (const key of Object.keys(publicSettings)) if (!allowedPublic.has(key)) throw Error(`Unknown public stream setting: ${key}`);
  for (const key of ['STREAM_MIRURO_ORIGINS', 'STREAM_MIRURO_REFERER']) {
    if (!values[key]) throw Error(`Missing ${key}`);
    for (const endpoint of values[key].split(',')) checkUrl(key, endpoint);
  }
  const serialized = JSON.stringify(publicSettings);
  for (const key of secretKeys) {
    const secret = values[key];
    if (secret && secret.length >= 8 && serialized.includes(secret)) throw Error(`Private value from ${key} was also placed in public stream settings`);
  }
  return { values, publicSettings, catalog: { providers }, privateFile };
}

export function filterRules(catalog, base) {
  const providers = catalog.providers.filter((provider) => provider.enabled && provider.origin !== '@local');
  const providerOrigins = Object.fromEntries(providers.map((provider) => [provider.id, provider.origin]));
  const frameRules = providers.flatMap((provider) => ['moviePath', 'tvPath', 'animePath'].flatMap((field) => {
    const template = provider[field];
    if (!template) return [];
    const [pathname, queryText] = template.split('?');
    const query = {};
    for (const [key, value] of new URLSearchParams(queryText || '')) {
      // Cosmetic flags are optional. Route identity in Rivestream/AniLink is mandatory.
      if (/\{(?:id|season|episode)\}/.test(value) || (provider.id === 'rivestream' && key === 'type') ||
          (provider.id === 'anilink' && key === 'variant')) query[key] = `^${pattern(value)}$`;
    }
    return [{ host: new URL(provider.origin).hostname, pathPattern: `^${pattern(pathname.replace(/\/$/, ''))}/?$`, query }];
  }));
  const playerHosts = [...new Set(providers.map((provider) => new URL(provider.origin).hostname))];
  return { ...base, playerHosts, scriptHosts: [...new Set([...base.scriptHosts, ...playerHosts])], providerOrigins, frameRules };
}

export async function writeGeneratedConfig(config, { root = projectRoot } = {}) {
  const base = JSON.parse(await readFile(path.join(root, 'config/online-filter.base.json'), 'utf8'));
  const output = async (filename, data) => {
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, data);
  };
  const json = (value) => JSON.stringify(value, null, 2) + '\n';
  await output(path.join(root, 'config/stream-providers.public.json'), json(config.catalog));
  await output(path.join(root, 'config/online-filter.json'), json(filterRules(config.catalog, base)));
  const serverModule = '// Generated by scripts/configure-streams.mjs. Public endpoints only.\nexport const streamDefaults: Record<string, string> = ' + JSON.stringify(config.publicSettings, null, 2) + ';\n';
  const clientModule = `// Generated from the public portion of stream configuration; never contains credentials.\nexport interface StreamProvider { id: string; name: string; origin: string; enabled: boolean; moviePath?: string; tvPath?: string; animePath?: string; languages: string[]; autoVariants: string[]; manualAnime: boolean; singleAudio: boolean; animeIssue: string }\nexport const streamCatalog: { providers: StreamProvider[] } = ${JSON.stringify(config.catalog, null, 2)};\n`;
  for (const dir of ['.local/cinepro', 'web/core', 'vendor/cinepro']) {
    try { await readFile(path.join(root, dir, 'package.json')); } catch { continue; }
    await output(path.join(root, dir, 'src/config/stream-settings.generated.ts'), serverModule);
  }
  for (const dir of ['.local/cinepro-ui', 'vendor/cinepro-ui', 'web']) {
    try { await readFile(path.join(root, dir, 'package.json')); } catch { continue; }
    await output(path.join(root, dir, 'src/server/services/stream-settings.generated.ts'), serverModule);
    if (dir !== 'web') await output(path.join(root, dir, 'src/client/src/lib/stream-providers.generated.ts'), clientModule);
  }
}

export async function initializePrivateConfig({ root = projectRoot } = {}) {
  const destination = path.join(root, '.local/stream-providers.env');
  try { await readFile(destination); return { created: false }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const defaults = await readFile(path.join(root, 'config/stream-providers.env.example'), 'utf8');
  // Existing installations are imported without printing credentials or touching originals.
  const sources = await Promise.all(['.local/cinepro/.env', '.local/tmdb.env', 'web/.env'].map((file) => optionalEnv(path.join(root, file))));
  const migrated = {};
  for (const key of secretKeys) {
    const candidates = [...new Set(sources.map((source) => source[key]).filter(Boolean))];
    if (candidates.length > 1) throw Error(`Conflicting legacy values for ${key}; choose one in .local/stream-providers.env before migrating`);
    migrated[key] = candidates[0] || '';
  }
  for (const key of ['LOCAL_API_TOKEN', 'CINEPRO_API_TOKEN']) if (!migrated[key]) migrated[key] = randomBytes(32).toString('hex');
  let content = defaults;
  for (const key of secretKeys) {
    if (/[\r\n\0'"]/.test(migrated[key])) throw Error(`Unsupported credential characters in ${key}; migrate this value manually`);
    content = content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}='${migrated[key]}'`);
  }
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  try { await writeFile(destination, content, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code === 'EEXIST') return { created: false }; throw error; }
  await chmod(destination, 0o600);
  return { created: true };
}
