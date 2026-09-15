/**
 * Server routes - Health check
 */
import type { FastifyInstance } from "fastify"

export async function registerHealthRoutes(app: FastifyInstance) {
    app.get("/api/health", async () => {
        return { status: "ok", timestamp: new Date().toISOString() }
    })

    if (process.env.NODE_ENV === "development" && process.argv.includes("--dev")) {
        app.get("/api/debug", async () => {
            return app.config
        })
    }
}
