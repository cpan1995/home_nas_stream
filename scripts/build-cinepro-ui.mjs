import { spawnSync } from 'node:child_process';
import { loadStreamConfig, writeGeneratedConfig, projectRoot } from './stream-config.mjs';
import path from 'node:path';

await writeGeneratedConfig(await loadStreamConfig());
const result = spawnSync('npm', ['run', 'build'], {
  cwd: path.join(projectRoot, '.local/cinepro-ui'), stdio: 'inherit',
  env: { ...process.env, VITE_LOCAL_API: 'true', VITE_TMDB_API_KEY: 'local-proxy', VITE_STANDALONE: 'false', VITE_OMSS_API_URL: '/api/core' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
