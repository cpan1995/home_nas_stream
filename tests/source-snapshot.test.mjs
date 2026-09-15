import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = path.resolve('scripts/snapshot-cinepro-sources.mjs');

async function fixture({ credential = false } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cinepro-snapshot-'));
  for (const name of ['cinepro-ui', 'cinepro']) {
    const base = path.join(directory, '.local', name);
    await mkdir(path.join(base, 'src'), { recursive: true });
    await mkdir(path.join(base, 'tests'), { recursive: true });
    await writeFile(path.join(base, 'src', 'main.ts'), `export const ${name.replace('-', '')} = true;\n`);
    await mkdir(path.join(base, 'src', 'generated'), { recursive: true });
    await writeFile(path.join(base, 'src', 'generated', 'public-config.ts'), 'export const publicConfig = {};\n');
    await writeFile(path.join(base, 'tests', 'unit.test.mjs'), 'export {};\n');
    await writeFile(path.join(base, 'tests', 'local-network.test.mjs'), 'export {};\n');
    await writeFile(path.join(base, 'package.json'), `{"name":"${name}"}\n`);
    await writeFile(path.join(base, 'LICENSE'), 'MIT\n');
    await writeFile(path.join(base, '.env'), 'API_KEY=do-not-copy\n');
    await writeFile(path.join(base, '.env.example'), 'API_KEY=placeholder\n');
    await writeFile(path.join(base, 'source.env'), 'API_KEY=do-not-copy\n');
    await writeFile(path.join(base, 'source.env.production'), 'API_KEY=do-not-copy\n');
    await writeFile(path.join(base, 'src', '.env.private'), 'API_KEY=do-not-copy\n');
    if (credential) await writeFile(path.join(base, 'src', 'credentials.ts'), 'const password = "do-not-copy";\n');
    await mkdir(path.join(base, 'node_modules', 'dependency'), { recursive: true });
    await writeFile(path.join(base, 'node_modules', 'dependency', 'index.js'), 'unsafe');
    await mkdir(path.join(base, 'dist'), { recursive: true });
    await writeFile(path.join(base, 'dist', 'bundle.js'), 'unsafe');
  }
  return directory;
}

async function snapshot(directory, args = []) {
  return run(process.execPath, [script, ...args], { cwd: directory });
}

test('snapshots source, generated public defaults, manifests, tests, licenses, and required launch files', async () => {
  const directory = await fixture();
  for (const name of ['cinepro-ui', 'cinepro']) {
    const base = path.join(directory, '.local', name);
    await writeFile(path.join(base, 'run-local.sh'), '#!/bin/sh\n');
    await writeFile(path.join(base, 'local-network.mjs'), 'export {};\n');
    await writeFile(path.join(base, 'local-server.mjs'), 'export {};\n');
  }
  await snapshot(directory);
  const ui = path.join(directory, 'vendor', 'cinepro-ui');
  assert.equal(await readFile(path.join(ui, 'src', 'main.ts'), 'utf8'), 'export const cineproui = true;\n');
  assert.equal(await readFile(path.join(ui, 'LICENSE'), 'utf8'), 'MIT\n');
  assert.equal(await readFile(path.join(ui, 'src', 'generated', 'public-config.ts'), 'utf8'), 'export const publicConfig = {};\n');
  assert.equal(await readFile(path.join(ui, 'run-local.sh'), 'utf8'), '#!/bin/sh\n');
  await assert.rejects(readFile(path.join(ui, '.env')));
  await assert.rejects(readFile(path.join(ui, '.env.example')));
  await assert.rejects(readFile(path.join(ui, 'source.env')));
  await assert.rejects(readFile(path.join(ui, 'source.env.production')));
  await assert.rejects(readFile(path.join(ui, 'src', '.env.private')));
  await assert.rejects(readFile(path.join(ui, 'tests', 'local-network.test.mjs')));
  await assert.rejects(readFile(path.join(ui, 'node_modules', 'dependency', 'index.js')));
  const provenance = JSON.parse(await readFile(path.join(ui, 'SNAPSHOT_PROVENANCE.json'), 'utf8'));
  assert.equal(provenance.customizedSnapshot, true);
  assert.equal(provenance.sourceKind, 'local-customized-snapshot');
});

test('blocks the entire snapshot when an eligible source contains a credential-like literal', async () => {
  const directory = await fixture({ credential: true });
  await assert.rejects(snapshot(directory), (error) => {
    assert.equal(error.stderr, 'Credential-like content blocked: src/credentials.ts\n');
    assert.doesNotMatch(error.stderr, /do-not-copy/);
    return true;
  });
  await assert.rejects(readFile(path.join(directory, 'vendor', 'cinepro-ui', 'src', 'main.ts')));
});

test('sanitizes provenance URLs and never serializes remote credentials', async () => {
  const directory = await fixture();
  const git = path.join(directory, '.local', 'cinepro-ui', '.git');
  const coreGit = path.join(directory, '.local', 'cinepro', '.git');
  await mkdir(git, { recursive: true });
  await mkdir(coreGit, { recursive: true });
  await writeFile(path.join(git, 'config'), '[remote "origin"]\n\turl = https://user:private-token@example.test/cinepro-ui.git?token=private#private\n');
  await writeFile(path.join(git, 'HEAD'), '0123456789abcdef0123456789abcdef01234567\n');
  await writeFile(path.join(coreGit, 'config'), '[remote "origin"]\n\turl = https://example.test/cinepro.git?ref=main#documentation\n');
  await writeFile(path.join(coreGit, 'HEAD'), '0123456789abcdef0123456789abcdef01234567\n');
  await snapshot(directory);
  const provenance = await readFile(path.join(directory, 'vendor', 'cinepro-ui', 'SNAPSHOT_PROVENANCE.json'), 'utf8');
  const coreProvenance = await readFile(path.join(directory, 'vendor', 'cinepro', 'SNAPSHOT_PROVENANCE.json'), 'utf8');
  assert.match(provenance, /"remote": null/);
  assert.doesNotMatch(provenance, /user|private-token|token=/);
  assert.match(coreProvenance, /https:\/\/example\.test\/cinepro\.git/);
  assert.doesNotMatch(coreProvenance, /ref=main|documentation/);
});

test('rejects symlinks instead of following them out of the runtime tree', async () => {
  const directory = await fixture();
  const outside = path.join(directory, 'outside-secret.ts');
  await writeFile(outside, 'API_KEY=outside-secret\n');
  await symlink(outside, path.join(directory, '.local', 'cinepro-ui', 'src', 'outside.ts'));
  const { stderr } = await snapshot(directory);
  assert.match(stderr, /Skipped symlink: src[\\/]outside\.ts/);
  await assert.rejects(readFile(path.join(directory, 'vendor', 'cinepro-ui', 'src', 'outside.ts')));
});

test('restore seeds only missing runtime directories and refuses a vendored symlink', async () => {
  const directory = await fixture();
  await snapshot(directory);
  const original = path.join(directory, '.local', 'cinepro', 'src', 'main.ts');
  await writeFile(original, 'export const preserved = true;\n');
  await run(process.execPath, ['-e', "require('fs').rmSync('.local/cinepro-ui', { recursive: true, force: true })"], { cwd: directory });
  await snapshot(directory, ['--restore']);
  assert.equal(await readFile(original, 'utf8'), 'export const preserved = true;\n');
  assert.equal(await readFile(path.join(directory, '.local', 'cinepro-ui', 'src', 'main.ts'), 'utf8'), 'export const cineproui = true;\n');
  await run(process.execPath, ['-e', "require('fs').rmSync('.local/cinepro-ui', { recursive: true, force: true })"], { cwd: directory });
  await symlink(path.join(directory, 'outside-secret.ts'), path.join(directory, 'vendor', 'cinepro-ui', 'linked'));
  await assert.rejects(snapshot(directory, ['--restore']), /Snapshot contains a symlink/);
});
