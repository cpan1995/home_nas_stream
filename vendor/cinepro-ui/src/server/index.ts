/**
 * Server entry point
 * Bootstraps and starts the Fastify application
 */
import { buildApp } from "./app.js"

async function main() {

    try {
        const app = await buildApp()
        await app.listen({
            port: app.config.PORT,
            host: app.config.HOST,
        })

        console.log(`CinePro/ui is running at http://${app.config.HOST}:${app.config.PORT}`)
        console.log(`Check for updates at https://github.com/cinepro-org/ui\n`)
        console.log(`Press CTRL+C to stop\n`)
    } catch (err) {
        console.error("Failed to start server:", err instanceof Error ? err.message : String(err))
        process.exit(1)
    }
}

main().catch(() => { console.error("CinePro could not start. Check the local server log."); process.exitCode = 1 })
