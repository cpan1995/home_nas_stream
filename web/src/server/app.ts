/**
 * Fastify application factory
 * Sets up the core Fastify instance with plugins and routes
 */
import Fastify from "fastify"
import { registerWebApi } from "./routes/web-api.js"
import { registerPlugins } from "./plugins/index.js"
import { registerHealthRoutes } from "./routes/health.js"
import { requestLogger } from "./plugins/logger.js"
import "./types/index.js"
import { registerApiRoutes } from "./routes/api.js"
import { registerAuth } from "./auth.js"

export async function buildApp() {
    const app = Fastify({
        logger: false,
        trustProxy: process.env.TRUST_PROXY === "true",
    })

    // Register request logging
    app.addHook("onRequest", requestLogger)

    // Register all plugins
    await registerPlugins(app)
    await registerAuth(app, app.config)

    // Register routes
    await registerHealthRoutes(app)
    await registerWebApi(app)
    await registerApiRoutes(app)

    // Catch-all route for SPA
    app.get("*", (_, reply) => {
        return reply.html()
    })

    return app
}
