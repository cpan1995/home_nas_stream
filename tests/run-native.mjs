import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { checkPlayback } from "./native-smoke.mjs";

await mkdir(".local", { recursive: true });
const root = await mkdtemp(path.resolve(".local/playback-test-"));
const movies = path.join(root, "movies");
await mkdir(movies);
const subtitles = path.join(root, "captions.srt");
await writeFile(
  subtitles,
  "1\n00:00:00,000 --> 00:01:59,000\nScreening Room subtitle check\n",
);
const encoder = spawn(
  "ffmpeg",
  [
    "-v",
    "error",
    "-nostdin",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=24",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:sample_rate=48000",
    "-i",
    subtitles,
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-map",
    "2:a",
    "-map",
    "3:s",
    "-t",
    "120",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "35",
    "-c:a",
    "aac",
    "-c:s",
    "srt",
    "-metadata:s:a:0",
    "title=First audio",
    "-metadata:s:a:1",
    "title=Second audio",
    path.join(movies, "Playback.Check.2026.mkv"),
  ],
  { stdio: ["ignore", "ignore", "inherit"] },
);
if ((await once(encoder, "exit"))[0] !== 0)
  throw Error("Could not generate the playback fixture");

async function run(resumePosition) {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const app = spawn(
    path.resolve("build/native-test/screening-room"),
    ["--no-network-remote", "--library", movies, "--data-dir", path.join(root, "data")],
    {
      env: {
        ...process.env,
        QT_QPA_PLATFORM:
          process.env.SCREENING_ROOM_TEST_PLATFORM || "offscreen",
        QTWEBENGINE_CHROMIUM_FLAGS: "--disable-gpu",
        QTWEBENGINE_REMOTE_DEBUGGING: `127.0.0.1:${port}`,
        SCREENING_ROOM_TEST_OUTPUT_DIR: root,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  app.stdout.on("data", (chunk) => {
    log += chunk;
  });
  app.stderr.on("data", (chunk) => {
    log += chunk;
  });
  let exited = false;
  const closed = once(app, "close").then(() => {
    exited = true;
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (exited) throw Error("Native application exited during startup");
      try {
        const pages = await (
          await fetch(`http://127.0.0.1:${port}/json/list`)
        ).json();
        ready = pages.some((page) => page.url.includes("/ui/index.html"));
      } catch {
        /* Wait for the local debugging endpoint. */
      }
      if (ready) break;
      await delay(250);
    }
    if (!ready) throw Error("Native application did not become ready");
    return await checkPlayback(port, resumePosition);
  } catch (error) {
    console.error(log);
    throw error;
  } finally {
    if (!exited) {
      app.kill("SIGTERM");
      await Promise.race([closed, delay(3000)]);
      if (!exited) {
        app.kill("SIGKILL");
        await closed;
      }
    }
    await writeFile(
      path.join(
        root,
        resumePosition === undefined ? "playback.log" : "restart.log",
      ),
      log,
    );
  }
}
console.log(`Playback test artifacts: ${root}`);
const savedPosition = await run();
await run(savedPosition);
