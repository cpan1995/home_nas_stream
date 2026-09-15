import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Film, LogOut, UserRound } from "lucide-react"
import { createPortal } from "react-dom"
import "./auth.css"

interface User { name: string; email: string; picture?: string }
interface Session { user: User | null; configured: boolean; signupEnabled: boolean }
const AuthContext = createContext<{ user: User; logout: () => Promise<void>; busy: boolean; error: string } | null>(null)

function callbackError() {
    const params = new URLSearchParams(window.location.search)
    const error = params.get("auth_error") || params.get("error")
    if (!error) return ""
    if (error === "signup_closed") return "Registration is closed. Please sign in with an existing account."
    if (error === "account_exists") return "An account already uses that email. Please sign in with your password."
    if (["access_denied", "not_allowed", "unauthorized"].includes(error)) return "This account does not have access. Please use an approved Google account."
    return "Google sign-in could not be completed. Please try again."
}

export default function AuthGate({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(callbackError)
    const [busy, setBusy] = useState(false)
    const [attempt, setAttempt] = useState(0)
    const isSignup = session?.signupEnabled === true && window.location.pathname !== "/login"
    const [name, setName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [confirmation, setConfirmation] = useState("")

    useEffect(() => {
        if (!session) return
        if (session.user && ["/login", "/signup"].includes(window.location.pathname)) {
            window.location.replace("/")
        } else if (!session.user && (!session.signupEnabled || !["/login", "/signup"].includes(window.location.pathname))) {
            const destination = session.signupEnabled ? "/signup" : "/login"
            window.history.replaceState(null, "", `${destination}${window.location.search}`)
        }
    }, [session])

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (busy) return
        setError("")
        if (isSignup && password !== confirmation) {
            setError("Your passwords don't match. Please try again.")
            return
        }
        setBusy(true)
        try {
            const response = await fetch(isSignup ? "/auth/signup" : "/auth/login", {
                method: "POST", credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(isSignup ? { name: name.trim(), email: email.trim(), password } : { email: email.trim(), password }),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || "We couldn't complete your request. Please try again.")
            if (!data.user) throw new Error("We couldn't confirm your sign-in. Please try again.")
            window.location.replace("/")
        } catch (error) {
            setError(error instanceof Error ? error.message : "We couldn't connect. Please try again.")
            setBusy(false)
        }
    }

    useEffect(() => {
        const controller = new AbortController()
        fetch("/auth/session", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
            .then(async response => {
                if (!response.ok) throw new Error("Session unavailable")
                const data = await response.json() as Session
                if (typeof data.configured !== "boolean" || typeof data.signupEnabled !== "boolean") throw new Error("Invalid session")
                setSession(data)
            })
            .catch(() => { if (!controller.signal.aborted) setError("We couldn't check your sign-in. Please try again.") })
            .finally(() => { if (!controller.signal.aborted) setLoading(false) })
        return () => controller.abort()
    }, [attempt])

    async function logout() {
        setBusy(true)
        setError("")
        try {
            const response = await fetch("/auth/logout", { method: "POST", credentials: "same-origin" })
            if (!response.ok) throw new Error("Sign-out failed")
            // A full navigation clears in-memory catalog and account data.
            window.location.replace("/login")
        } catch {
            setError("We couldn't sign you out. Please try again.")
            setBusy(false)
        }
    }

    if (session?.user && !["/login", "/signup"].includes(window.location.pathname)) return <AuthContext.Provider value={{ user: session.user, logout, busy, error }}>{children}</AuthContext.Provider>

    return (
        <main className="auth-page">
            <section className="auth-card" aria-labelledby="auth-title" aria-busy={loading || busy}>
                <div className="auth-brand"><Film aria-hidden="true" size={23} /><span>Screening Room</span><span className="auth-web-label">WEB</span></div>
                <h1 id="auth-title">{isSignup ? "Create your account." : "Welcome back."}</h1>
                <p className="auth-description">{isSignup ? "Your next great watch starts here. Sign up to explore movies and shows." : "Log in to find your next movie night favorite."}</p>
                {loading || session?.user ? <p role="status" className="auth-status">Checking your sign-in…</p> : <>
                    {error && <p id="auth-error" className="auth-error" role="alert">{error}</p>}
                    {!session ? <button className="auth-primary" onClick={() => { setLoading(true); setError(""); setAttempt(value => value + 1) }}>Try again</button> : <>
                        <form className="auth-form" onSubmit={submit} aria-describedby={error ? "auth-error" : undefined}>
                            {isSignup && <label className="auth-field" htmlFor="auth-name">Name
                                <input id="auth-name" name="name" autoComplete="name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={busy} />
                            </label>}
                            <label className="auth-field" htmlFor="auth-email">Email
                                <input id="auth-email" name="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} autoCapitalize="none" spellCheck={false} />
                            </label>
                            <label className="auth-field" htmlFor="auth-password">Password
                                <input id="auth-password" name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} required minLength={isSignup ? 12 : undefined} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} aria-describedby={isSignup ? "password-hint" : undefined} />
                            </label>
                            {isSignup && <>
                                <p id="password-hint" className="auth-hint">Use at least 12 characters.</p>
                                <label className="auth-field" htmlFor="auth-confirmation">Confirm password
                                    <input id="auth-confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} />
                                </label>
                            </>}
                            <button className="auth-primary" type="submit" disabled={busy}>{busy ? (isSignup ? "Creating account…" : "Logging in…") : (isSignup ? "Create account" : "Log in")}</button>
                        </form>
                        {session.configured && <>
                            <div className="auth-divider"><span>or</span></div>
                            <button type="button" className="auth-google" disabled={busy} onClick={() => { window.location.assign("/auth/google") }}><GoogleMark />Continue with Google</button>
                        </>}
                        {session.signupEnabled && <p className="auth-switch">{isSignup ? "Already have an account? " : "New to Screening Room? "}<a href={isSignup ? "/login" : "/signup"}>{isSignup ? "Log in" : "Sign up"}</a></p>}
                    </>}
                </>}
            </section>
        </main>
    )
}

export function AccountMenu() {
    const auth = useContext(AuthContext)
    const [open, setOpen] = useState(false)
    const container = useRef<HTMLDivElement>(null)
    const panel = useRef<HTMLDivElement>(null)
    const trigger = useRef<HTMLButtonElement>(null)
    useEffect(() => {
        if (!open) return
        panel.current?.querySelector<HTMLButtonElement>("button")?.focus()
        function outside(event: PointerEvent) { if (!container.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setOpen(false) }
        function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); trigger.current?.focus() } }
        document.addEventListener("pointerdown", outside)
        document.addEventListener("keydown", escape)
        return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape) }
    }, [open])
    if (!auth) return null
    return <div ref={container} className="auth-account">
        <button ref={trigger} type="button" className="auth-account-trigger" aria-label="Your account" aria-expanded={open} aria-controls="account-details" onClick={() => setOpen(value => !value)}><UserRound size={20} aria-hidden="true" /></button>
        {open && createPortal(<div ref={panel} id="account-details" className="auth-account-panel">
            <p className="auth-account-name">{auth.user.name}</p><p className="auth-account-email">{auth.user.email}</p>
            <button type="button" className="auth-signout" disabled={auth.busy} onClick={() => void auth.logout()}><LogOut size={16} aria-hidden="true" />{auth.busy ? "Signing out…" : "Sign out"}</button>
            {auth.error && <p role="alert" className="auth-error">{auth.error}</p>}
        </div>, document.body)}
    </div>
}

function GoogleMark() {
    return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.92A6 6 0 0 1 6.1 12c0-.67.11-1.31.31-1.92V7.49H3.07A10 10 0 0 0 2 12c0 1.61.38 3.14 1.07 4.51l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z"/></svg>
}
