// Explicit test double; production always uses PostgreSQL.
import { randomUUID } from "node:crypto"
import type { Account, AuthStore, Transaction, User } from "./auth-store.js"
export function memoryStore(): AuthStore {
    const accounts = new Map<string, Account>()
    const sessions = new Map<string, { user: User; expires: number }>()
    const transactions = new Map<string, Transaction>()
    return {
        async accountByEmail(email) { return accounts.get(email) },
        async createAccount(email, name, passwordHash) { if (accounts.has(email)) return undefined; const user = { id: randomUUID(), email, name }; accounts.set(email, { ...user, passwordHash }); return user },
        async googleAccount(sub, email, name, picture, allowCreate = false) {
            const existing = [...accounts.values()].find(value => value.googleSub === sub)
            if (existing) { const { googleSub, passwordHash, ...user } = existing; return user }
            if (!allowCreate || accounts.has(email)) return undefined
            const user = { id: randomUUID(), email, name, ...(picture ? { picture } : {}) }; accounts.set(email, { ...user, googleSub: sub }); return user
        },
        async putSession(hash, user, expires) { sessions.set(hash, { user, expires }) },
        async session(hash, now) { const session = sessions.get(hash); return session && session.expires > now ? session.user : undefined },
        async deleteSession(hash) { sessions.delete(hash) },
        async putTransaction(hash, value) { transactions.set(hash, value) },
        async consumeTransaction(hash) { const value = transactions.get(hash); transactions.delete(hash); return value },
        async prune(now) { for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key); for (const [key, value] of transactions) if (value.expires <= now) transactions.delete(key) },
        async close() {},
    }
}
