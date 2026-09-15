import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import Fastify from "fastify"
import { registerAuth } from "./auth.js"
import { memoryStore } from "./auth-test-store.js"

const config = { SIGNUP_ENABLED: true, APP_ORIGIN: "http://localhost:5174", GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_ALLOWED_EMAILS: "owner@example.com" }
async function fixture(options: { email?: string; verified?: boolean; nonce?: string; production?: boolean; signupEnabled?: boolean; store?: ReturnType<typeof memoryStore> } = {}) {
    const app = Fastify()
    let time = 1_000_000
    let authorization: URL
    let calls = 0
    await registerAuth(app, { ...config, SIGNUP_ENABLED: options.signupEnabled ?? true, ...(options.production ? { APP_ORIGIN: "https://example.com" } : {}) }, {
        store: options.store ?? memoryStore(),
        now: () => time,
        production: options.production ?? false,
        exchange: async (code, verifier, redirectUri) => {
            calls++
            assert.equal(code, "valid-code")
            assert.equal(redirectUri, `${options.production ? "https://example.com" : config.APP_ORIGIN}/auth/callback`)
            assert.equal(createHash("sha256").update(verifier).digest("base64url"), authorization.searchParams.get("code_challenge"))
            return {
                sub: "google-id",
                email: options.email ?? "owner@example.com",
                email_verified: options.verified ?? true,
                name: "Owner",
                nonce: options.nonce ?? authorization.searchParams.get("nonce")!,
            }
        },
    })
    app.get("/api/private", async () => ({ secret: true }))
    app.post("/api/private", async () => ({ ok: true }))
    const begin = async () => {
        const response = await app.inject("/auth/google")
        assert.equal(response.statusCode, 302)
        authorization = new URL(response.headers.location!)
        assert.equal(authorization.origin, "https://accounts.google.com")
        assert.equal(authorization.searchParams.get("code_challenge_method"), "S256")
        return { cookie: String(response.headers["set-cookie"]).split(";")[0], state: authorization.searchParams.get("state")! }
    }
    const finish = async (login: { cookie: string; state: string }) => app.inject({ url: `/auth/callback?code=valid-code&state=${login.state}`, headers: { cookie: login.cookie } })
    return {
        app,
        begin,
        finish,
        advance: (ms: number) => {
            time += ms
        },
        calls: () => calls,
    }
}

test("missing Google configuration leaves local authentication available", async (t) => {
    const app = Fastify()
    t.after(() => app.close())
    await registerAuth(app, { APP_ORIGIN: config.APP_ORIGIN, SIGNUP_ENABLED: true }, { store: memoryStore() })
    app.get("/api/private", async () => ({ secret: true }))
    assert.deepEqual((await app.inject("/auth/session")).json(), { user: null, configured: false, signupEnabled: true })
    assert.equal((await app.inject("/auth/google")).statusCode, 503)
    assert.equal((await app.inject("/api/private")).statusCode, 401)
    for (const url of ["/%61pi/private", "/api%2fprivate", "//api/private", "/api//private"]) {
        assert.equal((await app.inject(url)).statusCode, 401, url)
    }

})

test("valid Google login creates an opaque session, protects mutations and revokes logout", async (t) => {
    const f = await fixture()
    t.after(() => f.app.close())
    const login = await f.begin()
    const response = await f.finish(login)
    assert.equal(response.headers.location, "/")
    const rawCookie = (response.headers["set-cookie"] as string[]).find((value) => value.startsWith("cinepro_session="))!
    assert.match(rawCookie, /HttpOnly; SameSite=Lax/)
    assert.doesNotMatch(rawCookie, /owner@example/)
    const cookie = rawCookie.split(";")[0]
    const session = await f.app.inject({ url: "/auth/session", headers: { cookie } })
    assert.equal(session.json().user.email, "owner@example.com")
    assert.equal(session.headers["cache-control"], "no-store")
    assert.equal((await f.app.inject({ url: "/api/private", headers: { cookie } })).statusCode, 200)
    assert.equal((await f.app.inject({ method: "POST", url: "/api/private", headers: { cookie, origin: "https://evil.example" } })).statusCode, 403)
    assert.equal((await f.app.inject({ method: "POST", url: "/api/private", headers: { cookie, origin: config.APP_ORIGIN } })).statusCode, 200)
    assert.equal((await f.app.inject({ method: "POST", url: "/auth/logout", headers: { cookie } })).statusCode, 403)
    assert.equal((await f.app.inject({ method: "POST", url: "/auth/logout", headers: { cookie, origin: config.APP_ORIGIN } })).statusCode, 200)
    assert.equal((await f.app.inject({ url: "/api/private", headers: { cookie } })).statusCode, 401)
    assert.equal((await f.finish(login)).headers.location, "/?auth_error=invalid_request")
    assert.equal(f.calls(), 1)
})

test("callback requires matching browser state and rejects expired transactions", async (t) => {
    const f = await fixture()
    t.after(() => f.app.close())
    const login = await f.begin()
    assert.equal((await f.finish({ ...login, cookie: "" })).headers.location, "/?auth_error=invalid_request")
    assert.equal((await f.finish({ ...login, state: "forged" })).headers.location, "/?auth_error=invalid_request")
    const expired = await f.begin()
    f.advance(600_001)
    assert.equal((await f.finish(expired)).headers.location, "/?auth_error=invalid_request")
    assert.equal(f.calls(), 0)
})

test("unknown accounts, unverified email and wrong nonce are denied", async (t) => {
    for (const options of [{ email: "stranger@example.com" }, { verified: false }, { nonce: "forged" }]) {
        const f = await fixture(options)
        t.after(() => f.app.close())
        assert.equal((await f.finish(await f.begin())).headers.location, "/?auth_error=access_denied")
        assert.equal((await f.app.inject("/auth/session")).json().user, null)
    }
})

test("production cookies are secure and sessions expire", async (t) => {
    const f = await fixture({ production: true })
    t.after(() => f.app.close())
    const response = await f.finish(await f.begin())
    const rawCookie = (response.headers["set-cookie"] as string[]).find((value) => value.startsWith("__Host-cinepro_session="))!
    assert.match(rawCookie, /; Secure$/)
    const headers = { cookie: rawCookie.split(";")[0] }
    assert.equal((await f.app.inject({ url: "/api/private", headers })).statusCode, 200)
    f.advance(12 * 60 * 60 * 1000)
    assert.equal((await f.app.inject({ url: "/api/private", headers })).statusCode, 401)
})

test("local HTTP is supported in Docker; nonlocal HTTP is rejected", async (t) => {
    const app = Fastify(); t.after(() => app.close())
    await registerAuth(app, { ...config, GOOGLE_ALLOWED_EMAILS: "" }, { store: memoryStore(), production: true })
    assert.equal((await app.inject("/auth/session")).json().configured, true)
    const invalid = Fastify(); t.after(() => invalid.close())
    await assert.rejects(registerAuth(invalid, { ...config, APP_ORIGIN: "http://example.com" }, { store: memoryStore() }), /APP_ORIGIN/)
})

test("signup validates, normalizes emails, rejects duplicates, persists sessions and verifies passwords", async (t) => {
    const store = memoryStore()
    const app = Fastify(); t.after(() => app.close())
    await registerAuth(app, { APP_ORIGIN: config.APP_ORIGIN, SIGNUP_ENABLED: true }, { store })
    const headers = { origin: config.APP_ORIGIN }
    const payload = { name: " Owner ", email: " OWNER@example.com ", password: "a good long password" }
    assert.equal((await app.inject({ method: "POST", url: "/auth/signup", payload })).statusCode, 403)
    assert.equal((await app.inject({ method: "POST", url: "/auth/signup", headers, payload: { ...payload, password: "short" } })).statusCode, 400)
    const signup = await app.inject({ method: "POST", url: "/auth/signup", headers, payload })
    assert.equal(signup.statusCode, 201)
    assert.equal(signup.json().user.email, "owner@example.com")
    assert.equal(signup.json().user.name, "Owner")
    assert.equal(signup.json().user.passwordHash, undefined)
    const stored = await store.accountByEmail("owner@example.com")
    assert.match(stored!.passwordHash!, /^scrypt\$/)
    assert.ok(!stored!.passwordHash!.includes(payload.password))
    assert.equal((await app.inject({ method: "POST", url: "/auth/signup", headers, payload })).statusCode, 409)
    for (const invalid of [{ ...payload, password: "wrong password" }, { ...payload, email: "nobody@example.com" }]) {
        const response = await app.inject({ method: "POST", url: "/auth/login", headers, payload: invalid })
        assert.equal(response.statusCode, 401); assert.equal(response.json().error, "Invalid email or password")
    }
    const login = await app.inject({ method: "POST", url: "/auth/login", headers, payload })
    assert.equal(login.statusCode, 200)
    const cookie = String(login.headers["set-cookie"]).split(";")[0]
    const second = Fastify(); t.after(() => second.close())
    await registerAuth(second, { APP_ORIGIN: config.APP_ORIGIN, SIGNUP_ENABLED: true }, { store })
    assert.equal((await second.inject({ url: "/auth/session", headers: { cookie } })).json().user.id, signup.json().user.id)
    await second.inject({ method: "POST", url: "/auth/logout", headers: { ...headers, cookie } })
    assert.equal((await app.inject({ url: "/auth/session", headers: { cookie } })).json().user, null)
})

test("Google never silently links a local password account", async (t) => {
    const f = await fixture(); t.after(() => f.app.close())
    const response = await f.app.inject({ method: "POST", url: "/auth/signup", headers: { origin: config.APP_ORIGIN }, payload: { name: "Owner", email: "owner@example.com", password: "a long password" } })
    assert.equal(response.statusCode, 201)
    assert.equal((await f.finish(await f.begin())).headers.location, "/?auth_error=account_exists")
})


test("signup defaults closed and existing password accounts can still log in", async (t) => {
    const store = memoryStore()
    const { hashPassword } = await import("./password.js")
    await store.createAccount("owner@example.com", "Owner", await hashPassword("a good long password"))
    const app = Fastify(); t.after(() => app.close())
    await registerAuth(app, { APP_ORIGIN: config.APP_ORIGIN }, { store })
    assert.equal((await app.inject("/auth/session")).json().signupEnabled, false)
    const headers = { origin: config.APP_ORIGIN }
    const payload = { name: "New", email: "new@example.com", password: "a good long password" }
    assert.equal((await app.inject({ method: "POST", url: "/auth/signup", headers, payload })).statusCode, 403)
    assert.equal(await store.accountByEmail("new@example.com"), undefined)
    assert.equal((await app.inject({ method: "POST", url: "/auth/login", headers, payload: { email: "owner@example.com", password: payload.password } })).statusCode, 200)
})

test("closed signup rejects new Google identities but accepts existing Google accounts", async (t) => {
    const store = memoryStore()
    const denied = await fixture({ signupEnabled: false, store }); t.after(() => denied.app.close())
    assert.equal((await denied.finish(await denied.begin())).headers.location, "/?auth_error=signup_closed")
    assert.equal(await store.accountByEmail("owner@example.com"), undefined)
    assert.equal(await store.googleAccount("google-id", "owner@example.com", "Owner"), undefined)
    const user = await store.googleAccount("google-id", "owner@example.com", "Owner", undefined, true)
    assert.ok(user)
    const allowed = await fixture({ signupEnabled: false, store }); t.after(() => allowed.app.close())
    assert.equal((await allowed.finish(await allowed.begin())).headers.location, "/")
    assert.equal((await store.googleAccount("google-id", "owner@example.com", "Owner", undefined, false))?.id, user.id)
    assert.equal(await store.googleAccount("other-id", "owner@example.com", "Owner", undefined, false), undefined)
})
