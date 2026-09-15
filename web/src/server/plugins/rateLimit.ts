/**
 * Rate limiting plugin configuration
 */
import type { FastifyInstance } from "fastify"
import rateLimit from "@fastify/rate-limit"

export async function registerRateLimitPlugin(app: FastifyInstance) {
    await app.register(rateLimit, {
        max: 100,
        timeWindow: "1 second",
        // Page loads request many chunks and translations. Limit server actions,
        // without letting those public assets exhaust the API/auth budget.
        allowList: request => {
            let path = request.url.split("?")[0]
            try { path = decodeURIComponent(path).replace(/\/{2,}/g, "/") } catch { /* Malformed paths are rejected by routing. */ }
            return ![path, request.routeOptions.url ?? ""].some(value => /^\/(?:api|auth)(?:\/|$)/.test(value))
        },
    })
}
