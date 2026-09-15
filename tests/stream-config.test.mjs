import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, cp, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseEnv } from 'node:util';
import { loadStreamConfig, writeGeneratedConfig, initializePrivateConfig, filterRules, projectRoot } from '../scripts/stream-config.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stream-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'config'));
  await mkdir(path.join(root, '.local'), { recursive: true });
  for (const file of ['stream-providers.env.example', 'online-filter.base.json']) {
    await cp(path.join(projectRoot, 'config', file), path.join(root, 'config', file));
  }
  return root;
}

test('all current TV providers and route identities survive default generation', async (t) => {
  const root = await fixture(t);
  const { catalog } = await loadStreamConfig({ root, env: {} });
  assert.equal(catalog.providers.length, 16);
  assert.equal(catalog.providers.filter((p) => p.moviePath).length, 5);
  assert.equal(catalog.providers.find((p) => p.id === 'nontongo').singleAudio, true);
  assert.equal(catalog.providers.find((p) => p.id === 'cinezo').animeIssue, 'Unavailable: anime route opens a demo');
  const rules = filterRules(catalog, { scriptHosts: [], blockedDomains: [] });
  const rive = rules.frameRules.find((r) => r.host === 'www.rivestream.app' && r.query.type === '^tv$');
  assert.ok(new RegExp(rive.pathPattern).test('/embed'));
  assert.ok(new RegExp(rive.query.id).test('42'));
  assert.equal(new RegExp(rive.query.id).test('anything'), false);
  assert.ok(rive.query.season && rive.query.episode);
});

test('one private override updates the client catalog, Core defaults, and native policy without secrets', async (t) => {
  const root = await fixture(t);
  const secrets = ['test-private-tmdb-value-123', 'test-private-local-value-456', 'test-private-web-value-789'];
  await writeFile(path.join(root, '.local/stream-providers.env'), [
    'STREAM_VIDFAST_ORIGIN=https://player.example.test',
    "STREAM_VIDFAST_MOVIE_PATH='/watch/{id}?autoplay=false'",
    `TMDB_READ_ACCESS_TOKEN=${secrets[0]}`, `LOCAL_API_TOKEN=${secrets[1]}`, `CINEPRO_API_TOKEN=${secrets[2]}`,
  ].join('\n'));
  for (const dir of ['.local/cinepro', '.local/cinepro-ui', 'web', 'web/core']) {
    await mkdir(path.join(root, dir), { recursive: true });
    await writeFile(path.join(root, dir, 'package.json'), '{}');
  }
  const config = await loadStreamConfig({ root, env: {} });
  await writeGeneratedConfig(config, { root });
  assert.equal(config.values.TMDB_READ_ACCESS_TOKEN, secrets[0]);
  const publicFile = await readFile(path.join(root, 'config/stream-providers.public.json'), 'utf8');
  assert.match(publicFile, /player.example.test/);
  const policy = JSON.parse(await readFile(path.join(root, 'config/online-filter.json'), 'utf8'));
  assert.equal(policy.playerHosts.includes('vidfast.vc'), false);
  assert.equal(policy.providerOrigins.vidfast, 'https://player.example.test');
  assert.ok(policy.frameRules.some((r) => r.host === 'player.example.test' && new RegExp(r.pathPattern).test('/watch/12')));
  const outputs = [publicFile];
  for (const file of ['.local/cinepro/src/config/stream-settings.generated.ts', '.local/cinepro-ui/src/client/src/lib/stream-providers.generated.ts', 'web/src/server/services/stream-settings.generated.ts']) {
    outputs.push(await readFile(path.join(root, file), 'utf8'));
  }
  for (const content of outputs) for (const secret of secrets) assert.equal(content.includes(secret), false);
  assert.equal(Object.hasOwn(config.publicSettings, 'TMDB_READ_ACCESS_TOKEN'), false);
});

test('disabled providers disappear from native permissions and public consumers can filter them', async (t) => {
  const root = await fixture(t);
  const config = await loadStreamConfig({ root, env: { STREAM_VIDFAST_ENABLED: 'false' } });
  const rules = filterRules(config.catalog, { scriptHosts: [], blockedDomains: [] });
  assert.equal(config.catalog.providers.find((p) => p.id === 'vidfast').enabled, false);
  assert.equal(Object.hasOwn(rules.providerOrigins, 'vidfast'), false);
  assert.equal(rules.frameRules.some((r) => r.host === 'vidfast.vc'), false);
});

test('rejects credential leaks and invalid endpoints/templates without echoing values', async (t) => {
  const root = await fixture(t);
  for (const env of [
    { STREAM_VIDFAST_ORIGIN: 'https://user:privatepass@example.test' },
    { STREAM_VIDFAST_MOVIE_PATH: '/movie/{unknown}' },
    { STREAM_VIDFAST_MOVIE_PATH: '//evil.test/movie/{id}' },
    { STREAM_VIDFAST_MOVIE_PATH: '/movie/{id}?api_key=privatepass' },
    { STREAM_ANILINK_ANIME_PATH: '/watch/{id}/{episode}?variant={language}&variant=sub' },
    { STREAM_VIDFAST_MOVIE_PATH: '/watch/../movie/{id}' },
    { STREAM_VIDFAST_API_KEY: 'privatepass' },
    { STREAM_CORE_VIDFAST_BASE_URL: 'not-a-url' },
    { STREAM_VIDFAST_NAME: 'a-private-token', TMDB_READ_ACCESS_TOKEN: 'a-private-token' },
  ]) {
    await assert.rejects(loadStreamConfig({ root, env }), (error) => !error.message.includes('privatepass') && !error.message.includes('a-private-token'));
  }
});

test('private initialization migrates tokens, uses 0600, and preserves an existing file', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, '.local/cinepro'));
  await writeFile(path.join(root, '.local/cinepro/.env'), 'TMDB_READ_ACCESS_TOKEN=fixture-private-key\nLOCAL_API_TOKEN=fixture-local-key\n');
  assert.equal((await initializePrivateConfig({ root })).created, true);
  const filename = path.join(root, '.local/stream-providers.env');
  const first = await readFile(filename, 'utf8');
  assert.equal(parseEnv(first).TMDB_READ_ACCESS_TOKEN, 'fixture-private-key');
  assert.equal(parseEnv(first).CINEPRO_API_TOKEN.length, 64);
  assert.equal((await stat(filename)).mode & 0o777, 0o600);
  assert.equal((await initializePrivateConfig({ root })).created, false);
  assert.equal(await readFile(filename, 'utf8'), first);
});

test('conflicting credentials stop migration and defaults-only ignores local secrets/settings', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, '.local/cinepro'));
  await writeFile(path.join(root, '.local/cinepro/.env'), 'TMDB_READ_ACCESS_TOKEN=fixture-one');
  await writeFile(path.join(root, '.local/tmdb.env'), 'TMDB_READ_ACCESS_TOKEN=fixture-two');
  await assert.rejects(initializePrivateConfig({ root }), /Conflicting legacy values for TMDB_READ_ACCESS_TOKEN/);
  await assert.rejects(readFile(path.join(root, '.local/stream-providers.env')), { code: 'ENOENT' });
  const config = await loadStreamConfig({ root, defaultsOnly: true, env: { STREAM_VIDFAST_ORIGIN: 'https://override.example.test', TMDB_READ_ACCESS_TOKEN: 'fixture-one' } });
  assert.equal(config.values.TMDB_READ_ACCESS_TOKEN, '');
  assert.equal(config.values.STREAM_VIDFAST_ORIGIN, 'https://vidfast.vc');
});
