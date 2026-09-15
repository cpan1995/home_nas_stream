import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"

// OWASP scrypt minimum: N=2^17, r=8, p=1. Bound concurrency to keep memory predictable.
export class PasswordServiceBusy extends Error {}
let active = 0
const waiting: (() => void)[] = []
async function derive(password: string, salt: string): Promise<Buffer> {
    if (active >= 2) {
        if (waiting.length >= 16) throw new PasswordServiceBusy("Password service busy")
        await new Promise<void>((resolve) => waiting.push(resolve))
    } else active++
    try {
        return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)))
    } finally { const next = waiting.shift(); if (next) next(); else active-- }
}
export async function hashPassword(password: string) {
    const salt = randomBytes(16).toString("hex")
    return `scrypt$131072$8$1$${salt}$${(await derive(password, salt)).toString("hex")}`
}
const dummy = `scrypt$131072$8$1$${"00".repeat(16)}$${"00".repeat(64)}`
export async function verifyPassword(password: string, encoded?: string) {
    const parts = (encoded ?? dummy).split("$")
    if (parts.length !== 6 || parts.slice(0, 4).join("$") !== "scrypt$131072$8$1" || !/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return false
    const actual = await derive(password, parts[4])
    return timingSafeEqual(actual, Buffer.from(parts[5], "hex")) && Boolean(encoded)
}
