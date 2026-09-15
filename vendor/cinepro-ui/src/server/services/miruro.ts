import { gunzipSync } from "node:zlib"
import { streamDefaults } from "./stream-settings.generated.js"

// MiruroAPI wire protocol, adapted from Shineii86/MiruroAPI (MIT).
// Hosted inside this application; never depends on the author's demo server.
// See docs/anime-providers.md for provenance and operating limits.
type Json = Record<string, any>
type Fetch = typeof globalThis.fetch
function miruroSetting(name: "STREAM_MIRURO_ORIGINS" | "STREAM_MIRURO_REFERER") {
    const value = process.env[name] ?? streamDefaults[name]
    if (!value) throw Error(`Missing stream setting: ${name}`)
    if (process.env[name] !== undefined) {
        for (const part of (name === "STREAM_MIRURO_ORIGINS" ? value.split(",") : [value])) {
            let url: URL
            try { url = new URL(part.trim()) } catch { throw Error(`Invalid stream setting: ${name}`) }
            if (url.protocol !== "https:" || url.username || url.password || url.hash) throw Error(`Invalid stream setting: ${name}`)
        }
    }
    return value
}

export const miruroOrigins = miruroSetting("STREAM_MIRURO_ORIGINS").split(",").map(origin => origin.trim()).filter(Boolean)
export const miruroReferer = miruroSetting("STREAM_MIRURO_REFERER")
const pending = new Map<string, Promise<Json>>()
const cache = new Map<string, { until: number; value: Json }>()

export function decodeMiruro(body: string, obfuscated: string | null): Json {
    if (body.length > 2_000_000) throw Error("Miruro response is too large")
    if (!obfuscated) return JSON.parse(body)
    const bytes = Buffer.from(body, "base64url")
    if (obfuscated === "2") {
        const key = Buffer.from("71951034f8fbcf53d89db52ceb3dc22c", "hex")
        for (let i = 0; i < bytes.length; i++) bytes[i] ^= key[i % key.length]
    } else if (obfuscated !== "1") throw Error("Unknown Miruro response format")
    return JSON.parse(gunzipSync(bytes, { maxOutputLength: 2_000_000 }).toString("utf8"))
}

async function pipe(path: string, query: Json, request: Fetch, signal: AbortSignal) {
    const payload = Buffer.from(JSON.stringify({ path, method: "GET", query, body: null })).toString("base64url")
    for (const origin of miruroOrigins) {
        signal.throwIfAborted()
        try {
            const response = await request(`${origin}/api/secure/pipe?e=${payload}`, {
                headers: { Accept: "*/*", Referer: miruroReferer, Origin: new URL(miruroReferer).origin },
                signal: AbortSignal.any([signal, AbortSignal.timeout(3500)]),
            })
            if (!response.ok) { await response.body?.cancel(); continue }
            return decodeMiruro(await response.text(), response.headers.get("x-obfuscated"))
        } catch { signal.throwIfAborted() }
    }
    throw Error("Miruro is unavailable or blocking requests. Choose another anime server.")
}

// Match the exact episode and language. Never guess a slug or substitute a dub.
export function miruroEpisodes(data: Json, episode: number, language: string) {
    return Object.entries(data.providers || {}).flatMap(([provider, value]) => {
        const episodes = (value as Json)?.episodes
        const list = Array.isArray(episodes) ? (language === "sub" ? episodes : []) : episodes?.[language]
        if (!Array.isArray(list)) return []
        return list.filter(e => Number(e.number) === episode && typeof e.id === "string").slice(0, 1)
            .map(e => ({ provider, episodeId: e.id.includes(":") ? Buffer.from(e.id).toString("base64url") : e.id }))
    }).slice(0, 4)
}

export async function resolveMiruro(anilistId: number, episode: number, language: string, request: Fetch = globalThis.fetch): Promise<Json> {
    if (![anilistId, episode].every(n => Number.isSafeInteger(n) && n > 0) || !["sub", "dub"].includes(language)) throw Error("Invalid anime episode")
    const key = `${anilistId}:${episode}:${language}`
    const hit = cache.get(key)
    if (hit && hit.until > Date.now()) return hit.value
    if (pending.has(key)) return pending.get(key)!
    if (pending.size >= 8) throw Error("Anime lookups are busy. Try again shortly.")
    const work = (async () => {
        const signal = AbortSignal.timeout(18000)
        const catalog = await pipe("episodes", { anilistId }, request, signal)
        const candidates = miruroEpisodes(catalog, episode, language)
        for (const candidate of candidates) {
            try {
                const data = await pipe("sources", { ...candidate, anilistId, category: language }, request, signal)
                const streams = (Array.isArray(data.streams) ? data.streams : []).filter((s: Json) => typeof s.url === "string" && /^https?:\/\//.test(s.url))
                if (!streams.length) continue
                const value = { streams, subtitles: Array.isArray(data.subtitles || data.captions) ? (data.subtitles || data.captions) : [], provider: candidate.provider }
                if (cache.size >= 100) cache.delete(cache.keys().next().value!)
                cache.set(key, { until: Date.now() + 120000, value })
                return value
            } catch { signal.throwIfAborted() }
        }
        throw Error("Miruro has no playable source for this episode and language. Choose another anime server.")
    })()
    pending.set(key, work)
    try { return await work } finally { pending.delete(key) }
}
