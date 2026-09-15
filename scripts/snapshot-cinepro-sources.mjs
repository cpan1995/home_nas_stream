#!/usr/bin/env node
/**
 * Creates a deliberately small, reviewable source snapshot for fresh clones.
 * It never copies an entire runtime checkout: only named source roots and
 * selected root-level project files are eligible.
 */
import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restore = process.argv.slice(2).includes('--restore');
const projects = [
  { name: 'cinepro-ui', source: '.local/cinepro-ui', destination: 'vendor/cinepro-ui' },
  { name: 'cinepro', source: '.local/cinepro', destination: 'vendor/cinepro' },
];

const allowedDirectories = new Set(['src', 'public', 'tests', 'scripts']);
const excludedDirectoryNames = new Set([
  '.git', '.github', '.local', 'node_modules', 'dist', 'build', 'coverage',
  'data', 'cache', 'tmp', 'temp', 'test-results', 'playwright-report',
  'screenshots', 'local-test-results', '.run',
]);
const requiredRuntimeFiles = new Set([
  'run-local.sh', 'local-server.mjs', 'local-network.mjs', 'local-test.mjs',
  'local-media-check.mjs', 'local-movie-check.mjs', 'local-providers-check.mjs',
]);
const diagnosticName = /(?:^|[-_.])(local|live|diagnostic|audit|check|inspect|capture|debug)(?:[-_.]|$)/i;
const rootFile = /^(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|LICENSE(?:\.[\w-]+)?|README(?:\.[\w-]+)?|Dockerfile|compose\.ya?ml|render\.ya?ml|vercel\.json|wrangler\.json|tsconfig(?:\.[\w-]+)?\.json|vite\.config(?:\.[\w-]+)?\.[cm]?[jt]s|eslint\.config\.[cm]?[jt]s|components\.json|\.prettier(?:ignore|rc))$/i;
const secretPatterns = [
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/i,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*["'][^"']{8,}["']/i,
];

function absolute(relative) {
  const result = path.resolve(root, relative);
  if (result !== root && !result.startsWith(`${root}${path.sep}`)) throw new Error(`Path escapes repository: ${relative}`);
  return result;
}

async function exists(file) {
  try { await lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function assertNoSymlinkPath(relative) {
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (!await exists(current)) return;
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Path contains a symlink: ${relative}`);
  }
}

function isAllowedRootFile(name) {
  return (rootFile.test(name) || requiredRuntimeFiles.has(name)) && !isEnvironmentFile(name);
}

function isEnvironmentFile(name) {
  const lower = name.toLowerCase();
  return lower.startsWith('.env') || lower.includes('.env');
}

function isSafeDiagnostic(relative) {
  const parts = relative.split(path.sep);
  return parts[0] !== 'tests' || !diagnosticName.test(parts.at(-1));
}

async function containsSecret(source, relative) {
  let content = await readFile(source, 'utf8');
  // This local-only server passes a fixed public adapter label to OMSS; it is
  // not an account credential. Keep the narrow exception visible and scoped.
  if (relative === 'local-server.mjs') content = content.replace(/apiKey:\s*'local-bearer-adapter'/, 'apiKey: process.env.ADAPTER_LABEL');
  return secretPatterns.some((pattern) => pattern.test(content));
}

async function copyEligibleTree(sourceRoot, targetRoot, relative = '') {
  const current = path.join(sourceRoot, relative);
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const nextRelative = path.join(relative, entry.name);
    const source = path.join(sourceRoot, nextRelative);
    const target = path.join(targetRoot, nextRelative);
    const stat = await lstat(source);
    if (stat.isSymbolicLink()) {
      console.warn(`Skipped symlink: ${nextRelative}`);
      continue;
    }
    if (stat.isDirectory()) {
      if (excludedDirectoryNames.has(entry.name) || (relative === '' && !allowedDirectories.has(entry.name))) continue;
      await copyEligibleTree(sourceRoot, targetRoot, nextRelative);
      continue;
    }
    if (!stat.isFile() || isEnvironmentFile(entry.name)) continue;
    if (relative === '' && !isAllowedRootFile(entry.name)) continue;
    if (!isSafeDiagnostic(nextRelative)) {
      console.warn(`Skipped local diagnostic test: ${nextRelative}`);
      continue;
    }
    if (await containsSecret(source, nextRelative)) {
      throw new Error(`Credential-like content blocked: ${nextRelative}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { dereference: false, force: false, mode: fsConstants.COPYFILE_EXCL });
  }
}

async function assertNoSymlinkTree(directory, relative = '') {
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    const stat = await lstat(path.join(directory, next));
    if (stat.isSymbolicLink()) throw new Error(`Snapshot contains a symlink: ${next}`);
    if (stat.isDirectory()) await assertNoSymlinkTree(directory, next);
  }
}

function httpsRemote(value) {
  if (!value) return null;
  const ssh = value.match(/^(?:git@|ssh:\/\/git@)([^:/]+)[:/]([^\s]+)$/);
  const candidate = ssh ? `https://${ssh[1]}/${ssh[2]}` : value;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

async function provenance(source, name) {
  const git = path.join(source, '.git');
  let config = '';
  let head = '';
  try {
    config = await readFile(path.join(git, 'config'), 'utf8');
    head = (await readFile(path.join(git, 'HEAD'), 'utf8')).trim();
  } catch { /* A source checkout can be copied without git metadata. */ }
  const remote = httpsRemote(config.match(/\[remote "origin"\][\s\S]*?^\s*url\s*=\s*(.+)$/m)?.[1]?.trim());
  let commit = null;
  if (/^[0-9a-f]{40}$/i.test(head)) commit = head;
  if (head.startsWith('ref: ')) {
    try { commit = (await readFile(path.join(git, head.slice(5)), 'utf8')).trim(); } catch { /* packed refs are optional provenance. */ }
  }
  return {
    format: 1,
    project: name,
    sourceKind: 'local-customized-snapshot',
    customizedSnapshot: true,
    remote,
    commit: /^[0-9a-f]{40}$/i.test(commit ?? '') ? commit : null,
  };
}

async function snapshot(project) {
  await assertNoSymlinkPath(project.source);
  await assertNoSymlinkPath(project.destination);
  const source = absolute(project.source);
  const destination = absolute(project.destination);
  if (!await exists(source)) throw new Error(`Missing runtime source: ${project.source}`);
  const sourceStat = await lstat(source);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new Error(`Runtime source must be a real directory: ${project.source}`);
  const staging = `${destination}.staging`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  await copyEligibleTree(source, staging);
  await writeFile(path.join(staging, 'SNAPSHOT_PROVENANCE.json'), `${JSON.stringify(await provenance(source, project.name), null, 2)}\n`);
  await rm(destination, { recursive: true, force: true });
  await rename(staging, destination);
  console.log(`Snapshotted ${project.source} -> ${project.destination}`);
}

async function restoreMissing(project) {
  await assertNoSymlinkPath(project.source);
  await assertNoSymlinkPath(project.destination);
  const source = absolute(project.source);
  const vendor = absolute(project.destination);
  if (await exists(source)) {
    console.log(`Preserved existing runtime source: ${project.source}`);
    return;
  }
  if (!await exists(vendor)) throw new Error(`Cannot restore ${project.source}; snapshot missing at ${project.destination}`);
  const stat = await lstat(vendor);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Snapshot must be a real directory: ${project.destination}`);
  await assertNoSymlinkTree(vendor);
  await mkdir(path.dirname(source), { recursive: true });
  await cp(vendor, source, { recursive: true, dereference: false, errorOnExist: true, force: false });
  console.log(`Restored missing runtime source: ${project.source}`);
}

try {
  for (const project of projects) await (restore ? restoreMissing(project) : snapshot(project));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
