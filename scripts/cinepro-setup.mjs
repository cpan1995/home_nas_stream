import { spawnSync } from "node:child_process";
import { loadStreamConfig, writeGeneratedConfig } from "./stream-config.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The project includes the customized sources; no second checkout is needed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Browser bundles only receive a public proxy marker, never account credentials.
const buildEnv = { ...process.env, VITE_LOCAL_API: "true", VITE_TMDB_API_KEY: "local-proxy", VITE_STANDALONE: "false", VITE_OMSS_API_URL: "/api/core" };
function run(args, cwd) {
    const result = spawnSync("npm", args, { cwd, stdio: "inherit", env: buildEnv });
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error(`npm ${args.join(" ")} failed`);
}
try {
    const restored = spawnSync(process.execPath, [path.join(root, 'scripts/snapshot-cinepro-sources.mjs'), '--restore'], { cwd: root, stdio: 'inherit' });
    if (restored.status !== 0) throw Error('Could not restore CinePro sources');
    await writeGeneratedConfig(await loadStreamConfig());
    for (const name of ["cinepro", "cinepro-ui"]) {
        const cwd = path.join(root, ".local", name);
        run(["ci", "--ignore-scripts"], cwd);
        run(["run", "build"], cwd);
    }
    console.log("CinePro built. Configure .local/stream-providers.env before launching.");
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
