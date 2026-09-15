/**
 * Vite plugin configuration for serving the client
 */
import type { FastifyInstance } from "fastify"
import fastifyVite from "@fastify/vite"
import { resolve } from "node:path"

const isDev = process.argv.includes("--dev")

export async function registerVitePlugin(app: FastifyInstance) {
    await app.register(fastifyVite, {
        root: resolve(import.meta.dirname, "..", "..", ".."),
        distDir: resolve(import.meta.dirname, "..", "..", "..", "build", "client"),
        dev: isDev,
        spa: true,
    })

    await app.vite.ready()
}
