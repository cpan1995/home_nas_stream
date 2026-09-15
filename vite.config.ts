import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "local-library-preview",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === "/remote/" || req.url === "/remote")
            req.url = "/remote/index.html";
          next();
        });
        server.middlewares.use("/api/library", (_req, res) => {
          res.setHeader("Content-Type", "application/json");
          try {
            const library = JSON.parse(
              fs.readFileSync(".local/library.json", "utf8"),
            );
            res.end(JSON.stringify(library));
          } catch {
            res.statusCode = 503;
            res.end(
              JSON.stringify({
                error:
                  "Start the native app once to scan your movie folder, then refresh this preview.",
              }),
            );
          }
        });
        server.middlewares.use("/artwork", async (req, res) => {
          const name = (req.url ?? "").split("?")[0].slice(1);
          if (!/^[a-f0-9]{64}\.jpg$/.test(name)) {
            res.statusCode = 404;
            res.end();
            return;
          }
          try {
            const library = JSON.parse(
              await fs.promises.readFile(".local/library.json", "utf8"),
            );
            const movie = library.movies.find(
              (item: { id: string }) => item.id === name.slice(0, -4),
            );
            if (!movie) throw Error("Missing movie");
            const root = await fs.promises.realpath(library.path);
            const file = await fs.promises.realpath(
              path.resolve(root, movie.sourcePath || movie.filename),
            );
            if (!file.startsWith(root + path.sep))
              throw Error("Invalid movie path");
            const process = spawn("ffmpeg", [
              "-v",
              "error",
              "-nostdin",
              "-ss",
              String(Math.min(600, movie.duration * 0.15)),
              "-i",
              file,
              "-frames:v",
              "1",
              "-vf",
              "scale=1280:-2",
              "-q:v",
              "3",
              "-f",
              "image2pipe",
              "-vcodec",
              "mjpeg",
              "pipe:1",
            ]);
            const timer = setTimeout(() => process.kill(), 20000);
            const chunks: Buffer[] = [];
            let size = 0;
            process.stdout.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > 2 * 1024 * 1024) process.kill();
              else chunks.push(chunk);
            });
            process.on("error", () => {
              clearTimeout(timer);
              res.statusCode = 503;
              res.end();
            });
            process.on("close", (code) => {
              clearTimeout(timer);
              if (res.writableEnded) return;
              res.setHeader("Cache-Control", "no-store");
              if (code !== 0 || size > 2 * 1024 * 1024) {
                res.statusCode = 404;
                res.end();
                return;
              }
              res.setHeader("Content-Type", "image/jpeg");
              res.end(Buffer.concat(chunks));
            });
            res.on("close", () => process.kill());
          } catch {
            res.statusCode = 404;
            res.end();
          }
        });
      },
    },
  ],
  server: { port: 5173, strictPort: true },
});
