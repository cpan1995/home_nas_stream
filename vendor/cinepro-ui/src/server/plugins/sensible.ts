/**
 * Sensible plugin configuration
 * Provides useful defaults and utilities
 */
import type { FastifyInstance } from "fastify"
import sensible from "@fastify/sensible"

export async function registerSensiblePlugin(app: FastifyInstance) {
    await app.register(sensible)
}
