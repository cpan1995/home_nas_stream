/**
 * Environment configuration plugin
 * Validates and loads environment variables
 */
import type { FastifyInstance } from "fastify"
import env from "@fastify/env"

const schema = {
    type: "object",
    properties: {
        SIGNUP_ENABLED: { type: "boolean", default: false },
        APP_ORIGIN: { type: "string" },
        DATABASE_URL: { type: "string" },
        GOOGLE_CLIENT_ID: { type: "string" },
        GOOGLE_CLIENT_SECRET: { type: "string" },
        GOOGLE_ALLOWED_EMAILS: { type: "string" },
        PORT: {
            type: "number",
            default: 5175,
        },
        HOST: {
            type: "string",
            default: "localhost",
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
