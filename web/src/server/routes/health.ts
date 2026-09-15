import type { FastifyInstance } from "fastify"
export async function registerHealthRoutes(app: FastifyInstance) {
    app.get("/api/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }))
}
