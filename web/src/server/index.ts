/**
 * Server entry point
 * Bootstraps and starts the Fastify application
 */
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

async function main() {

    try {
        // Local source runs share the root private config. Container runs receive
        // the same file through Compose env_file and do not bundle the private file.
        const loader = resolve(process.cwd(), '../scripts/stream-config.mjs')
        let localSource = true
        try { await access(loader) } catch { localSource = false }
        if (localSource) {
            const { loadStreamConfig } = await import(pathToFileURL(loader).href)
            const { values } = await loadStreamConfig()
            Object.assign(process.env, values)
        }
        const { buildApp } = await import("./app.js")
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
