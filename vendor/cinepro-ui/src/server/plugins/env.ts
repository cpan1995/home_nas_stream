/**
 * Environment configuration plugin
 * Validates and loads environment variables
 */
import type { FastifyInstance } from "fastify"
import env from "@fastify/env"

const schema = {
    type: "object",
    required: ["VITE_TMDB_API_KEY"],
    properties: {
        PORT: {
            type: "number",
            default: 5173,
        },
        HOST: {
            type: "string",
            default: "localhost",
        },
        VITE_TMDB_API_KEY: {
            type: "string",
        },
        VITE_OMSS_API_URL: {
            type: "string",
        },
        VITE_STANDALONE: {
            type: "boolean",
            default: true,
        },
        ALLOWED_HOSTS: {
            type: "string",
            separator: ",",
        },
        TRUST_PROXY: {
            type: "boolean",
            default: false,
        },
    },
}

export async function registerConfigPlugin(app: FastifyInstance) {
    const options = {
        confKey: "config",
        schema: schema,
        dotenv: {
            quiet: true,
        },
    }

    await app.register(env, options)
}
