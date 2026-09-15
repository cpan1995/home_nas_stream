import { randomBytes } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"
import { initializePrivateConfig, writeGeneratedConfig, loadStreamConfig } from '../../scripts/stream-config.mjs'

const root = new URL("../", import.meta.url)
const target = new URL(".env", root)
let template
let existing = true
try { template = await readFile(target, "utf8") }
catch (error) {
    if (error.code !== "ENOENT") throw error
    existing = false
    template = await readFile(new URL(".env.example", root), "utf8")
}
const values = parseEnv(template)
let changed = !existing
for (const key of ["POSTGRES_PASSWORD"]) {
    if (values[key]) continue
    const line = `${key}=${randomBytes(32).toString("hex")}`
    const pattern = new RegExp(`^${key}=.*$`, "m")
    template = pattern.test(template) ? template.replace(pattern, line) : `${template}\n${line}\n`
    changed = true
}
if (changed) await writeFile(target, template, { flag: existing ? "w" : "wx", mode: 0o600 })
console.log(changed ? `Configured ${fileURLToPath(target)} with missing random service credentials; existing values preserved.` : "Existing web/.env configuration preserved.")
await initializePrivateConfig()
await writeGeneratedConfig(await loadStreamConfig())
console.log('Streaming credentials use .local/stream-providers.env at the project root.')
