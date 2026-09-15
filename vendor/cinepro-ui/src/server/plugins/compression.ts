/**
 * Compression plugin configuration
 */
import type { FastifyInstance } from "fastify"
import compress from "@fastify/compress"

export async function registerCompressionPlugin(app: FastifyInstance) {
    await app.register(compress, {
        global: true,
    })
}
