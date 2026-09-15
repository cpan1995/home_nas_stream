// Run on a real display; each run uses a temporary catalog/watch history.
// node tests/player-performance.mjs <movie-folder> [player-binary]
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { connectDesktop } from "./cdp.mjs";

if (!process.argv[2]) throw Error("Provide a movie folder");
const root = await mkdtemp(path.resolve(".local/player-performance-"));
const reservation = createServer().listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const app = spawn(
  path.resolve(process.argv[3] || "build/native-test/screening-room"),
  ["--library", path.resolve(process.argv[2]), "--data-dir", root, "--offline"],
  {
    env: {
      ...process.env,
      QT_QPA_PLATFORM: process.env.SCREENING_ROOM_TEST_PLATFORM || "xcb",
      QTWEBENGINE_REMOTE_DEBUGGING: `127.0.0.1:${port}`,
      QTWEBENGINE_CHROMIUM_FLAGS: "--disable-gpu",
      SCREENING_ROOM_TEST_OUTPUT_DIR: root,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let log = "",
  desktop,
  exited = false;
app.stdout.on("data", (chunk) => {
  log += chunk;
});
app.stderr.on("data", (chunk) => {
  log += chunk;
});
const closed = once(app, "close").then(() => {
  exited = true;
});
const ticks = async () => {
  const stat = await readFile(`/proc/${app.pid}/stat`, "utf8");
  const fields = stat
    .slice(stat.lastIndexOf(")") + 2)
    .trim()
    .split(/\s+/);
  return Number(fields[11]) + Number(fields[12]);
};
try {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (exited) throw Error("Player exited during startup");
    try {
      desktop = await connectDesktop(port);
      break;
    } catch {
      await delay(250);
    }
  }
  if (!desktop) throw Error("Player did not expose its bridge");
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await desktop.evaluate("!!window.__screeningPlayer")) break;
    await delay(250);
  }
  const library = JSON.parse(await desktop.call("library"));
  const movie =
    library.movies.find((m) => m.edition === "Web edition") ||
    library.movies[0];
  if (!movie) throw Error("Movie folder is empty");
  await desktop.call("volume", 0);
  await desktop.call("play", movie.id, true);
  const state = async () => JSON.parse(await desktop.call("playbackState"));
  const ui = async () => JSON.parse(await desktop.call("testState"));
  for (let attempt = 0; attempt < 80; attempt++) {
    if ((await state()).position > 1) break;
    await delay(250);
  }
  await desktop.call("seek", Math.min(300, movie.duration / 3));
  await delay(5000); // Exclude load, seek, shader warmup and visible controls.
  const before = {
    ticks: await ticks(),
    time: performance.now(),
    state: await state(),
    ui: await ui(),
  };
  const samples = [];
  for (let sample = 0; sample < 8; sample++) {
    await delay(2000);
    samples.push({ state: await state(), ui: await ui() });
  }
  const after = {
    ticks: await ticks(),
    time: performance.now(),
    state: await state(),
    ui: await ui(),
  };
  await desktop.call("capture", "steady-playback.png");
  const result = {
    binary: process.argv[3] || "build/native-test/screening-room",
    movie: movie.title,
    wallSeconds: (after.time - before.time) / 1000,
    cpuTicks: after.ticks - before.ticks,
    before,
    after,
    samples,
  };
  await writeFile(
    path.join(root, "performance.json"),
    JSON.stringify(result, null, 2),
  );
  if (
    Math.abs(
      after.state.position - before.state.position - result.wallSeconds,
    ) > 1 ||
    samples.some((s) => s.state.paused || s.state.volume !== 0) ||
    before.ui.seekCommands !== after.ui.seekCommands
  )
    throw Error(`Playback was interrupted during measurement; inspect ${root}`);
  console.log(
    JSON.stringify({
      artifacts: root,
      wallSeconds: result.wallSeconds,
      cpuTicks: result.cpuTicks,
      positionAdvanced: after.state.position - before.state.position,
      renderer: after.ui.renderer,
      audioOutput: after.ui.audioOutput,
      frames: after.ui.renderedFrames - before.ui.renderedFrames,
      outputDrops: after.ui.outputDrops - before.ui.outputDrops,
      decoderDrops: after.ui.decoderDrops - before.ui.decoderDrops,
      avSync: after.ui.avSync,
      hwdec: after.ui.hwdec,
    }),
  );
  await desktop.call("stop");
} finally {
  desktop?.close();
  if (!exited) {
    app.kill("SIGTERM");
    await Promise.race([closed, delay(3000)]);
    if (!exited) {
      app.kill("SIGKILL");
      await closed;
    }
  }
  await writeFile(path.join(root, "player.log"), log);
}
