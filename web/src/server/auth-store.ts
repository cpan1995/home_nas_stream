import { randomUUID } from "node:crypto"
import pg from "pg"

export type User = { id: string; email: string; name: string; picture?: string }
export type Account = User & { passwordHash?: string; googleSub?: string }
export type Transaction = { state: string; nonce: string; verifier: string; expires: number }
export interface AuthStore {
    accountByEmail(email: string): Promise<Account | undefined>
    googleAccount(sub: string, email: string, name: string, picture?: string, allowCreate?: boolean): Promise<User | undefined>
    createAccount(email: string, name: string, passwordHash: string): Promise<User | undefined>
    putSession(hash: string, user: User, expires: number): Promise<void>
    session(hash: string, now: number): Promise<User | undefined>
    deleteSession(hash: string): Promise<void>
    putTransaction(hash: string, transaction: Transaction): Promise<void>
    consumeTransaction(hash: string): Promise<Transaction | undefined>
    prune(now: number): Promise<void>
    close(): Promise<void>
}
const account = (row: Record<string, any>): Account => ({ id: row.id, email: row.email, name: row.name, ...(row.picture ? { picture: row.picture } : {}), ...(row.password_hash ? { passwordHash: row.password_hash } : {}), ...(row.google_sub ? { googleSub: row.google_sub } : {}) })
const user = (row: Record<string, any>): User => { const { passwordHash, googleSub, ...value } = account(row); return value }

export async function createPostgresStore(connectionString: string): Promise<AuthStore> {
    const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000 })
    pool.on("error", () => { console.error("PostgreSQL connection error") })
    const migration = await pool.connect()
    try {
        await migration.query("BEGIN")
        await migration.query("SELECT pg_advisory_xact_lock(734528101)")
        await migration.query(`
            CREATE TABLE IF NOT EXISTS auth_accounts (
                id uuid PRIMARY KEY, email text NOT NULL UNIQUE CHECK (email = lower(email)),
                name text NOT NULL, picture text, password_hash text, google_sub text UNIQUE,
                created_at timestamptz NOT NULL DEFAULT now(),
                CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL)
            );
            CREATE TABLE IF NOT EXISTS auth_sessions (
                token_hash text PRIMARY KEY, account_id uuid NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
                expires_at bigint NOT NULL
            );
            CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
            CREATE TABLE IF NOT EXISTS auth_oauth_transactions (
                token_hash text PRIMARY KEY, state text NOT NULL, nonce text NOT NULL, verifier text NOT NULL, expires_at bigint NOT NULL
            );
            CREATE INDEX IF NOT EXISTS auth_oauth_expiry ON auth_oauth_transactions(expires_at);
        `)
        await migration.query("COMMIT")
    } catch (error) { await migration.query("ROLLBACK"); migration.release(); await pool.end(); throw error }
    migration.release()
    return {
        async accountByEmail(email) { const { rows } = await pool.query("SELECT * FROM auth_accounts WHERE email=$1", [email]); return rows[0] && account(rows[0]) },
        async createAccount(email, name, passwordHash) {
            const { rows } = await pool.query("INSERT INTO auth_accounts(id,email,name,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *", [randomUUID(), email, name, passwordHash]); return rows[0] && user(rows[0])
        },
        async googleAccount(sub, email, name, picture, allowCreate = false) {
            const existing = await pool.query("SELECT * FROM auth_accounts WHERE google_sub=$1", [sub])
            if (existing.rows[0]) return user(existing.rows[0])
            // Never attach a Google identity to an existing local account by email.
            if (!allowCreate) return undefined
            const inserted = await pool.query("INSERT INTO auth_accounts(id,email,name,picture,google_sub) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING *", [randomUUID(), email, name, picture ?? null, sub])
            if (inserted.rows[0]) return user(inserted.rows[0])
            const raced = await pool.query("SELECT * FROM auth_accounts WHERE google_sub=$1", [sub])
            return raced.rows[0] && user(raced.rows[0])
        },
        async putSession(hash, value, expires) { await pool.query("INSERT INTO auth_sessions(token_hash,account_id,expires_at) VALUES($1,$2,$3)", [hash, value.id, expires]) },
        async session(hash, now) { const { rows } = await pool.query("SELECT a.* FROM auth_sessions s JOIN auth_accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>$2", [hash, now]); return rows[0] && user(rows[0]) },
        async deleteSession(hash) { await pool.query("DELETE FROM auth_sessions WHERE token_hash=$1", [hash]) },
        async putTransaction(hash, value) { await pool.query("INSERT INTO auth_oauth_transactions(token_hash,state,nonce,verifier,expires_at) VALUES($1,$2,$3,$4,$5)", [hash, value.state, value.nonce, value.verifier, value.expires]) },
        async consumeTransaction(hash) { const { rows } = await pool.query("DELETE FROM auth_oauth_transactions WHERE token_hash=$1 RETURNING *", [hash]); const row = rows[0]; return row && { state: row.state, nonce: row.nonce, verifier: row.verifier, expires: Number(row.expires_at) } },
        async prune(now) { await pool.query("DELETE FROM auth_sessions WHERE expires_at<=$1", [now]); await pool.query("DELETE FROM auth_oauth_transactions WHERE expires_at<=$1", [now]) },
        async close() { await pool.end() },
    }
}
