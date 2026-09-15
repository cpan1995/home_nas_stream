import { spawn } from "node:child_process";
import { mkdir, open, readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadStreamConfig } from "./stream-config.mjs";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, ".local/cinepro-runtime");
const core = path.join(root, ".local/cinepro");
const ui = path.join(root, ".local/cinepro-ui");
const { values: config } = await loadStreamConfig();
await mkdir(runtime, { recursive: true, mode: 0o700 });

async function coreHealthy() {
    try {
        const response = await fetch("http://127.0.0.1:3030/v1/health", { headers: { Authorization: `Bearer ${config.LOCAL_API_TOKEN}` }, signal: AbortSignal.timeout(2500) });
        const value = await response.json();
        return response.ok && value.spec === "omss";
    } catch { return false; }
}
async function uiHealthy() {
    try {
        const response = await fetch("http://127.0.0.1:5174/api/local/health", { signal: AbortSignal.timeout(2500) });
        return response.ok && (await response.json()).application === "cinepro-local-ui";
    } catch { return false; }
}
async function portOccupied(port) {
    try { await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(2500) }); return true; }
    catch { return false; }
}
async function start(name, cwd, args, healthy, port) {
    if (await healthy()) { console.log(`${name}: already running`); return; }
    if (await portOccupied(port)) throw Error(`${name}: port ${port} is occupied by a different or unhealthy server. See ${runtime}; no process was stopped.`);
    const log = await open(path.join(runtime, `${name}.log`), "a", 0o600);
    const child = spawn(args[0], args.slice(1), { cwd, detached: true, stdio: ["ignore", log.fd, log.fd], env: { ...process.env, ...config,
        NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port),
        VITE_LOCAL_API: "true", VITE_TMDB_API_KEY: "local-proxy", VITE_STANDALONE: "false",
        VITE_OMSS_API_URL: "/api/core", CINEPRO_CORE_DIR: core } });
    let failed;
    child.on("error", error => { failed = error; });
    child.unref();
    await log.close();
    if (child.pid) await writeFile(path.join(runtime, `${name}.pid`), String(child.pid), { mode: 0o600 });
    for (let attempt = 0; attempt < 60; attempt++) {
        if (await healthy()) { console.log(`${name}: ready`); return; }
        if (failed || child.exitCode !== null) throw Error(`${name} exited during startup. Read ${path.join(runtime, `${name}.log`)}`);
        await delay(500);
    }
    throw Error(`${name} did not become ready. Read ${path.join(runtime, `${name}.log`)}`);
}

const lockPath = path.join(runtime, "launch.lock");
let locked = false;
try {
    // Serialize repeat/double-click launches across Windows terminals.
    for (let attempt = 0; attempt < 100; attempt++) {
        try {
            const lock = await open(lockPath, "wx", 0o600);
            await lock.writeFile(String(process.pid)); await lock.close(); locked = true; break;
        } catch (error) {
            if (error.code !== "EEXIST") throw error;
            const owner = Number(await readFile(lockPath, "utf8").catch(() => "0"));
            if (owner) {
                try { process.kill(owner, 0); }
                catch (error) { if (error.code === "ESRCH") { await rm(lockPath, { force: true }); continue; } }
            }
            await delay(500);
        }
    }
    if (!locked) throw Error("Another CinePro launch is still starting. Try again shortly.");
    if (process.argv.includes("--restart-ui")) {
        const pid = Number(await readFile(path.join(runtime, "ui.pid"), "utf8").catch(() => "0"));
        if (pid) {
            const command = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "");
            if (command) {
                const { realpath } = await import("node:fs/promises");
                if (!command.includes("build/server/index.js") || await realpath(`/proc/${pid}/cwd`) !== ui)
                    throw Error("The recorded UI PID belongs to another process; restart cancelled.");
                process.kill(pid, "SIGTERM");
                for (let i = 0; i < 40 && await uiHealthy(); i++) await delay(250);
                if (await uiHealthy()) throw Error("The UI did not stop; check its log before restarting.");
            }
        }
    }
    if (!process.argv.includes("--ui-only"))
        await start("core", core, ["bash", "run-local.sh", "start"], coreHealthy, 3030);
    await start("ui", ui, [process.execPath, "build/server/index.js"], uiHealthy, 5174);
    console.log(`CinePro is ready: http://localhost:5174
Logs: ${runtime}
Closing this terminal does not stop CinePro.`);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    if (locked) await rm(lockPath, { force: true });
}
