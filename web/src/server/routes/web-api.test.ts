import assert from "node:assert/strict"
import test from "node:test"
import Fastify from "fastify"
import { registerAuth } from "../auth.js"
import { memoryStore } from "../auth-test-store.js"
import { registerWebApi } from "./web-api.js"

test("every catalog and playback route requires authentication", async (t) => {
    const app = Fastify()
    t.after(() => app.close())
    await registerAuth(app, { APP_ORIGIN: "http://localhost:5175" }, { store: memoryStore() })
    await registerWebApi(app)
    for (const path of ["/api/tmdb/3/movie/123", "/api/cinepro/v1/movies/123", "/api/anime/miruro/123/1/sub", "/api/anime/resolve/tv/123", "/api/media/invalid"]) {
        const response = await app.inject(path)
        assert.equal(response.statusCode, 401, path)
        assert.equal(response.headers["cache-control"], "no-store", path)
    }
})

test("approved session reaches web routes without sibling installation files", async (t) => {
    const app = Fastify()
    t.after(() => app.close())
    let nonce = ""
    await registerAuth(app, { APP_ORIGIN: "http://localhost:5175", SIGNUP_ENABLED: true, GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test", GOOGLE_ALLOWED_EMAILS: "owner@example.com" }, {
        production: false,
        store: memoryStore(),
        exchange: async () => ({ sub: "owner", email: "owner@example.com", email_verified: true, nonce }),
    })
    await registerWebApi(app)
    const start = await app.inject("/auth/google")
    const location = new URL(start.headers.location!)
    nonce = location.searchParams.get("nonce")!
    const callback = await app.inject({ url: `/auth/callback?code=test&state=${location.searchParams.get("state")}`, headers: { cookie: String(start.headers["set-cookie"]).split(";")[0] } })
    const cookie = (callback.headers["set-cookie"] as string[]).find(value => value.startsWith("cinepro_session="))!.split(";")[0]
    const response = await app.inject({ url: "/api/media/invalid", headers: { cookie } })
    assert.equal(response.statusCode, 410)
    assert.match(response.headers["content-security-policy"] as string, /sandbox/)
    assert.equal(response.headers["x-content-type-options"], "nosniff")
    assert.equal(response.headers["cache-control"], "no-store")
})
