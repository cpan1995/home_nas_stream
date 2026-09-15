import { createHash, randomBytes } from "node:crypto"
import { OAuth2Client } from "google-auth-library"
import { createPostgresStore, type AuthStore, type User } from "./auth-store.js"
import { hashPassword, verifyPassword, PasswordServiceBusy } from "./password.js"
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"

type Identity = { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string; nonce?: string }
export type AuthConfig = {
    SIGNUP_ENABLED?: boolean
    DATABASE_URL?: string
    GOOGLE_CLIENT_ID?: string
    GOOGLE_CLIENT_SECRET?: string
    GOOGLE_ALLOWED_EMAILS?: string
    APP_ORIGIN?: string
}
type Dependencies = {
    store?: AuthStore
    now?: () => number
    exchange?: (code: string, verifier: string, redirectUri: string) => Promise<Identity>
    production?: boolean
}
const lifetime = 12 * 60 * 60 * 1000
const transactionLifetime = 10 * 60 * 1000
const token = () => randomBytes(32).toString("base64url")
const cookieValue = (request: FastifyRequest, name: string) =>
    request.headers.cookie
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`))
        ?.slice(name.length + 1)
function requestPath(request: FastifyRequest) {
    try {
        return decodeURIComponent(request.url.split("?")[0])
            .replace(/\\/g, "/")
            .replace(/\/{2,}/g, "/")
    } catch {
        return request.url.split("?")[0]
    }
}
const isApi = (request: FastifyRequest) => [requestPath(request), request.routeOptions.url ?? ""].some((path) => path === "/api" || path.startsWith("/api/"))

export async function registerAuth(app: FastifyInstance, config: AuthConfig, dependencies: Dependencies = {}) {
    const now = dependencies.now ?? Date.now
    const signupEnabled = config.SIGNUP_ENABLED === true
    let origin: string | undefined
    try {
        const url = new URL(config.APP_ORIGIN ?? "")
        if (
            url.origin === config.APP_ORIGIN &&
            !url.username &&
            !url.password &&
            (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
        )
            origin = url.origin
    } catch {
        /* Unconfigured authentication fails closed. */
    }
    if (!origin) throw new Error("APP_ORIGIN must be an HTTPS origin or a local HTTP origin")
    if (!dependencies.store && !config.DATABASE_URL) throw new Error("DATABASE_URL is required")
    const store = dependencies.store ?? await createPostgresStore(config.DATABASE_URL!)
    const secure = origin.startsWith("https:")
    const allowed = new Set(
        (config.GOOGLE_ALLOWED_EMAILS ?? "")
            .split(",")
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean)
    )
    const configured = Boolean(origin && config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET)
    const client = new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, `${origin}/auth/callback`)
    const exchange =
        dependencies.exchange ??
        (async (code, verifier, redirectUri) => {
            const { tokens } = await client.getToken({ code, codeVerifier: verifier, redirect_uri: redirectUri })
            if (!tokens.id_token) throw new Error("Missing ID token")
            const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.GOOGLE_CLIENT_ID })
            const identity = ticket.getPayload()
            if (!identity) throw new Error("Missing identity")
            return identity as Identity
        })
    const sessionName = secure ? "__Host-cinepro_session" : "cinepro_session"
    const transactionName = secure ? "__Host-cinepro_oauth" : "cinepro_oauth"
    const digest = (value: string) => createHash("sha256").update(value).digest("hex")
    const cookie = (name: string, value: string, maxAge: number) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`
    const timer = setInterval(() => { void store.prune(now()).catch(() => app.log.error("Auth cleanup failed")) }, 60_000)
    timer.unref()
    app.addHook("onClose", async () => { clearInterval(timer); await store.close() })
    const sessionFor = (request: FastifyRequest) => store.session(digest(cookieValue(request, sessionName) ?? ""), now())
    const establishSession = async (request: FastifyRequest, reply: FastifyReply, user: User) => {
        await store.deleteSession(digest(cookieValue(request, sessionName) ?? ""))
        const id = token()
        await store.putSession(digest(id), user, now() + lifetime)
        return cookie(sessionName, id, lifetime / 1000)
    }
    app.addHook("onRequest", async (request, reply) => {
        const path = requestPath(request)
        if (path.startsWith("/auth/") || path.startsWith("/api/")) reply.header("Cache-Control", "no-store")
        if (path.startsWith("/auth/") && !["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.origin !== origin) return reply.code(403).send({ error: "Invalid request origin" })
        if (isApi(request)) {
            if (!await sessionFor(request)) return reply.code(401).send({ error: "Sign in required" })
            if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.origin !== origin) {
                return reply.code(403).send({ error: "Invalid request origin" })
            }
        }
    })
    app.addHook("onSend", async (request, reply, payload) => {
        if (isApi(request) || requestPath(request).startsWith("/auth/")) reply.header("Cache-Control", "no-store")
        return payload
    })
    app.get("/healthz", async (_, reply) => {
        try { await store.accountByEmail("healthcheck@invalid"); return { status: "ok" } }
        catch { return reply.code(503).send({ status: "unavailable" }) }
    })
    app.get("/auth/session", async (request) => ({ user: await sessionFor(request) ?? null, configured, signupEnabled }))
    const credentials = (body: unknown, signup: boolean) => {
        if (!body || typeof body !== "object") return undefined
        const value = body as Record<string, unknown>
        if (typeof value.email !== "string" || typeof value.password !== "string") return undefined
        const email = value.email.trim().toLowerCase()
        const name = typeof value.name === "string" ? value.name.trim() : ""
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || value.password.length < (signup ? 12 : 1) || value.password.length > 128 || (signup && (!name || name.length > 100))) return undefined
        return { email, name, password: value.password }
    }
    app.post("/auth/signup", { bodyLimit: 4096, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
        if (!signupEnabled) return reply.code(403).send({ error: "Signup is closed. Please sign in with an existing account." })
        const value = credentials(request.body, true)
        if (!value) return reply.code(400).send({ error: "Enter a name, valid email, and password of 12–128 characters" })
        let passwordHash: string
        try { passwordHash = await hashPassword(value.password) }
        catch (error) { if (error instanceof PasswordServiceBusy) return reply.code(503).send({ error: "Please try again shortly" }); throw error }
        const user = await store.createAccount(value.email, value.name, passwordHash)
        if (!user) return reply.code(409).send({ error: "An account with this email already exists. Please sign in." })
        return reply.header("Set-Cookie", await establishSession(request, reply, user)).code(201).send({ user })
    })
    app.post("/auth/login", { bodyLimit: 4096, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
        const value = credentials(request.body, false)
        if (!value) return reply.code(400).send({ error: "Enter a valid email and password" })
        const account = await store.accountByEmail(value.email)
        let valid: boolean
        try { valid = await verifyPassword(value.password, account?.passwordHash) }
        catch (error) { if (error instanceof PasswordServiceBusy) return reply.code(503).send({ error: "Please try again shortly" }); throw error }
        if (!valid || !account) return reply.code(401).send({ error: "Invalid email or password" })
        const { passwordHash, googleSub, ...user } = account
        return reply.header("Set-Cookie", await establishSession(request, reply, user)).send({ user })
    })
    app.get("/auth/google", async (request, reply) => {
        if (!configured) return reply.code(503).send({ error: "Google sign-in is not configured" })
        await store.consumeTransaction(digest(cookieValue(request, transactionName) ?? ""))
        const transactionId = token()
        const transaction = { state: token(), nonce: token(), verifier: token(), expires: now() + transactionLifetime }
        await store.putTransaction(digest(transactionId), transaction)
        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
        url.search = new URLSearchParams({
            client_id: config.GOOGLE_CLIENT_ID!,
            redirect_uri: `${origin}/auth/callback`,
            response_type: "code",
            scope: "openid email profile",
            state: transaction.state,
            nonce: transaction.nonce,
            code_challenge: createHash("sha256").update(transaction.verifier).digest("base64url"),
            code_challenge_method: "S256",
            prompt: "select_account",
        }).toString()
        return reply.header("Set-Cookie", cookie(transactionName, transactionId, transactionLifetime / 1000)).redirect(url.toString())
    })
    app.get<{ Querystring: { code?: string; state?: string; error?: string } }>("/auth/callback", async (request, reply) => {
        const id = cookieValue(request, transactionName) ?? ""
        const transaction = await store.consumeTransaction(digest(id))
        reply.header("Set-Cookie", cookie(transactionName, "", 0))
        if (
            !configured ||
            !transaction ||
            transaction.expires <= now() ||
            typeof request.query.state !== "string" ||
            request.query.state !== transaction.state ||
            typeof request.query.code !== "string" ||
            request.query.error
        ) {
            return reply.redirect("/?auth_error=invalid_request")
        }
        try {
            const identity = await exchange(request.query.code, transaction.verifier, `${origin}/auth/callback`)
            const email = identity.email?.toLowerCase()
            if (!identity.sub || !email || identity.email_verified !== true || identity.nonce !== transaction.nonce || (allowed.size > 0 && !allowed.has(email))) {
                return reply.redirect("/?auth_error=access_denied")
            }
            const user = await store.googleAccount(identity.sub, email, identity.name || email, identity.picture, signupEnabled)
            if (!user) return reply.redirect(signupEnabled ? "/?auth_error=account_exists" : "/?auth_error=signup_closed")
            const sessionCookie = await establishSession(request, reply, user)
            return reply.header("Set-Cookie", [cookie(transactionName, "", 0), sessionCookie]).redirect("/")
        } catch {
            // Never log authorization codes, tokens, or provider error bodies.
            return reply.redirect("/?auth_error=sign_in_failed")
        }
    })
    app.post("/auth/logout", async (request, reply) => {
        if (!origin || request.headers.origin !== origin) return reply.code(403).send({ error: "Invalid request origin" })
        await store.deleteSession(digest(cookieValue(request, sessionName) ?? ""))
        return reply.header("Set-Cookie", cookie(sessionName, "", 0)).send({ ok: true })
    })
}
