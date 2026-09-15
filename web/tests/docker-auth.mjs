import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { spawn } from "node:child_process"

const origin = process.env.WEB_TEST_URL || "http://localhost:5180"
const email = `restart-${randomBytes(8).toString("hex")}@example.invalid`
const password = randomBytes(24).toString("base64url")
const request = (path, body, cookie) => fetch(`${origin}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Origin: origin, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
})
const responseCookie = response => response.headers.getSetCookie().find(value => /cinepro_session=/.test(value))?.split(";")[0]

const signup = await request("/auth/signup", { name: "Persistence check", email, password })
assert.equal(signup.status, 201)
const cookie = responseCookie(signup)
assert.ok(cookie)
const user = (await signup.json()).user
assert.equal(user.email, email)
assert.equal((await (await request("/auth/session", null, cookie)).json()).user.id, user.id)
console.log("Account created and session established; restarting only the app container.")

await new Promise((resolve, reject) => {
    const child = spawn(process.env.DOCKER_COMMAND || "docker", ["compose", "restart", "app"], { stdio: "inherit", cwd: new URL("../", import.meta.url) })
    child.on("error", reject)
    child.on("exit", code => code === 0 ? resolve() : reject(Error(`Docker restart exited ${code}`)))
})
let healthy = false
for (let attempt = 0; attempt < 60; attempt++) {
    try { healthy = (await request("/healthz")).ok } catch { /* Wait for startup. */ }
    if (healthy) break
    await new Promise(resolve => setTimeout(resolve, 1000))
}
assert.ok(healthy, "App becomes healthy after restart")
assert.equal((await (await request("/auth/session", null, cookie)).json()).user.id, user.id, "PostgreSQL session survives process restart")
assert.equal((await request("/auth/logout", {}, cookie)).status, 200)
assert.equal((await (await request("/auth/session", null, cookie)).json()).user, null)
const login = await request("/auth/login", { email, password })
assert.equal(login.status, 200, "Account can still log in after app restart")
assert.equal((await login.json()).user.id, user.id)
assert.equal((await request("/auth/logout", {}, responseCookie(login))).status, 200)
console.log("Docker persistence passed: account and session survive app restart, password login works, logout revokes both sessions.")
