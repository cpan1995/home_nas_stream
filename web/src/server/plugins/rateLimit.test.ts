import assert from "node:assert/strict"
import test from "node:test"
import Fastify from "fastify"
import { registerRateLimitPlugin } from "./rateLimit.js"

test("frontend assets do not exhaust the authentication rate limit", async (t) => {
    const app = Fastify()
    t.after(() => app.close())
    await registerRateLimitPlugin(app)
    app.get("/assets/app.js", async () => "export default {}")
    app.get("/auth/session", async () => ({ user: null }))
    const assets = await Promise.all(Array.from({ length: 120 }, () => app.inject("/assets/app.js")))
    assert.ok(assets.every(response => response.statusCode === 200))
    assert.equal((await app.inject("/auth/session")).statusCode, 200)
    const auth = await Promise.all(Array.from({ length: 120 }, () => app.inject("/auth/session")))
    assert.ok(auth.some(response => response.statusCode === 429), "Auth endpoints must retain abuse protection")
})
