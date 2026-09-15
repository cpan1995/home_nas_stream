/**
 * Plugin registration orchestrator
 * Imports and registers all server plugins in the correct order
 */
import type { FastifyInstance } from "fastify"
import { registerCorsPlugin } from "./cors.js"
import { registerHelmetPlugin } from "./helmet.js"
import { registerRateLimitPlugin } from "./rateLimit.js"
import { registerCompressionPlugin } from "./compression.js"
import { registerConfigPlugin } from "./env.js"
import { registerSensiblePlugin } from "./sensible.js"
import { registerVitePlugin } from "./vite.js"

export async function registerPlugins(app: FastifyInstance) {
    // Core infrastructure
    await registerConfigPlugin(app)
    await registerSensiblePlugin(app)

    // Security
    await registerHelmetPlugin(app)
    await registerCorsPlugin(app)
    await registerRateLimitPlugin(app)

    // Performance
    await registerCompressionPlugin(app)

    // Client serving
    await registerVitePlugin(app)
}
