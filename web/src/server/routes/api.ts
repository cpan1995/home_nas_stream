/**
 * Server routes - API endpoints (reserved for future use)
 */
import type { FastifyInstance } from "fastify"

export async function registerApiRoutes(app: FastifyInstance) {
    app.get("/api/*", async () => {
        return { message: "This endpoint is reserved for future use. Check for updates at https://github.com/cinepro-org/ui" }
    })
}
