/**
 * CORS plugin configuration for Fastify
 */
import type { FastifyInstance } from "fastify"
import cors from "@fastify/cors"

export async function registerCorsPlugin(app: FastifyInstance) {
    const allowedHosts = app.config.ALLOWED_HOSTS
    const normalize = (o: string) => o.replace(/\/$/, "")

    await app.register(cors, {
        origin: (origin, callback) => {
            if (!origin) {
                return callback(null, true)
            }

            if (allowedHosts.includes("*") || allowedHosts.includes(normalize(origin))) {
                return callback(null, true)
            }

            return callback(null, false)
        },
        credentials: true,
    })
}
