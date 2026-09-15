import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { createPostgresStore } from "./auth-store.js"

test("PostgreSQL persists accounts and sessions across connections and consumes OAuth atomically", { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
    const url = process.env.TEST_DATABASE_URL!
    const first = await createPostgresStore(url)
    const email = `integration-${randomUUID()}@example.com`
    const user = await first.createAccount(email, "Integration", "test-only-hash")
    assert.ok(user)
    assert.equal(await first.createAccount(email, "Duplicate", "hash"), undefined)
    assert.equal(await first.googleAccount(randomUUID(), email, "Conflict", undefined, true), undefined)
    const googleSub = randomUUID()
    const googleEmail = `integration-${randomUUID()}@example.com`
    assert.equal(await first.googleAccount(googleSub, googleEmail, "Closed"), undefined)
    assert.equal(await first.accountByEmail(googleEmail), undefined)
    const googleUser = await first.googleAccount(googleSub, googleEmail, "Google", undefined, true)
    assert.ok(googleUser)
    assert.equal((await first.googleAccount(googleSub, googleEmail, "Google", undefined, false))?.id, googleUser.id)
    const sessionHash = randomUUID()
    const transactionHash = randomUUID()
    await first.putSession(sessionHash, user, Date.now() + 60_000)
    await first.putTransaction(transactionHash, { state: "state", nonce: "nonce", verifier: "verifier", expires: Date.now() + 60_000 })
    await first.close()
    const second = await createPostgresStore(url); t.after(() => second.close())
    assert.equal((await second.session(sessionHash, Date.now()))?.id, user.id)
    assert.equal((await second.accountByEmail(email))?.passwordHash, "test-only-hash")
    const consumed = await Promise.all([second.consumeTransaction(transactionHash), second.consumeTransaction(transactionHash)])
    assert.equal(consumed.filter(Boolean).length, 1)
    await second.deleteSession(sessionHash)
    assert.equal(await second.session(sessionHash, Date.now()), undefined)
    await second.putSession(sessionHash, user, Date.now() - 1)
    assert.equal(await second.session(sessionHash, Date.now()), undefined)
    await second.prune(Date.now())
    // Cleanup is limited to the account created by this test.
    const { default: pg } = await import("pg")
    const pool = new pg.Pool({ connectionString: url })
    try { await pool.query("DELETE FROM auth_accounts WHERE id=ANY($1::uuid[])", [[user.id, googleUser.id]]) } finally { await pool.end() }
})
