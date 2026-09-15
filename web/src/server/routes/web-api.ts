import type { FastifyInstance } from "fastify"
import { publicFetch, validateDestination } from "../services/outbound.js"
import { randomBytes } from "node:crypto"
import { Readable } from "node:stream"
import { getAnimeGraph, resolveAnimeEpisode } from "../services/anime-mappings.js"
import { miruroReferer, resolveMiruro } from "../services/miruro.js"

// Only provider-resolved URLs receive a media ticket. There is no URL proxy API.
type MediaTicket = { url: string; headers: Record<string, string>; expires: number }
export async function registerWebApi(app: FastifyInstance) {
    const metadataToken = process.env.TMDB_READ_ACCESS_TOKEN || ""
    const coreToken = process.env.CINEPRO_API_TOKEN || ""
    const coreUrl = process.env.CINEPRO_API_URL || ""
    if (coreUrl) {
        const url = new URL(coreUrl)
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
            throw Error("CINEPRO_API_URL must be an HTTP(S) service URL without credentials, query or fragment")
    }
    const tickets = new Map<string, MediaTicket>()
    const ticketKeys = new Map<string, string>()
    const headersFor = (headers: Record<string, string> = {}) => Object.fromEntries(Object.entries(headers).filter(([key]) => ["referer", "origin", "user-agent", "accept"].includes(key.toLowerCase())))
    function ticket(url: string, headers: Record<string, string> = {}) {
        validateDestination(url)
        headers = headersFor(headers)
        const key = JSON.stringify([url, headers])
        const existing = ticketKeys.get(key)
        if (existing && (tickets.get(existing)?.expires || 0) > Date.now()) return `/api/media/${existing}`
        for (const [id, value] of tickets) if (value.expires < Date.now()) { tickets.delete(id); ticketKeys.delete(JSON.stringify([value.url, value.headers])) }
        if (tickets.size >= 20000) throw Error("Media session limit reached; try again later")
        const id = randomBytes(24).toString("hex")
        tickets.set(id, { url, headers, expires: Date.now() + 4 * 60 * 60 * 1000 })
        ticketKeys.set(key, id)
        return `/api/media/${id}`
    }
    function exposeSource(source: any) {
        let url = source.url, headers = source.headers || {}
        const wrapper = new URL(url)
        if (wrapper.pathname === "/v1/proxy" && wrapper.searchParams.has("data")) {
            const data = wrapper.searchParams.get("data")!
            let decoded
            try { decoded = JSON.parse(data) } catch { decoded = JSON.parse(decodeURIComponent(data)) }
            url = decoded.url; headers = decoded.headers || headers
        }
        validateDestination(url)
        return { ...source, url: source.type === "embed" ? url : ticket(url, headers), headers: undefined }
    }
    app.get<{ Params: { id: string; episode: string; language: string } }>("/api/anime/miruro/:id/:episode/:language", async (request, reply) => {
        const { id, episode, language } = request.params
        if (![id, episode].every(n => /^[1-9]\d*$/.test(n) && Number.isSafeInteger(Number(n))) || !["sub", "dub"].includes(language))
            return reply.code(400).send({ error: "Invalid anime episode" })
        try {
            const data = await resolveMiruro(Number(id), Number(episode), language, publicFetch as typeof fetch)
            const headers = { Referer: miruroReferer }
            const sources = data.streams.flatMap((s: any) => {
                try { return [{ url: ticket(s.url, { ...headers, ...headersFor(s.headers) }), type: s.type || "hls" }] } catch { return [] }
            })
            const subtitles = data.subtitles.flatMap((s: any, index: number) => {
                try {
                    if (s.kind && !["captions", "subtitles"].includes(s.kind)) return []
                    return [{ url: ticket(s.url || s.file, headers), label: String(s.label || s.name || s.lang || s.language || `Subtitle ${index + 1}`).slice(0, 160), language: String(s.lang || s.language || "").slice(0, 20) }]
                } catch { return [] }
            })
            if (!sources.length) throw Error("No usable media")
            return reply.header("Cache-Control", "no-store").send({ sources, subtitles })
        } catch { return reply.code(503).send({ error: "Miruro could not load this episode. Choose another anime server or retry shortly." }) }
    })
    app.get<{ Params: { type: string; id: string }; Querystring: { season?: string; episode?: string } }>("/api/anime/resolve/:type/:id", async (request, reply) => {
        const { type, id } = request.params
        const season = request.query.season || "1", episode = request.query.episode || "1"
        if (!["movie", "tv"].includes(type) || !/^[1-9]\d*$/.test(id) || !/^\d+$/.test(season) || !/^[1-9]\d*$/.test(episode) ||
            ![id, season, episode].every(n => Number.isSafeInteger(Number(n)))) return reply.code(400).send({ error: "Invalid anime lookup" })
        try {
            const match = resolveAnimeEpisode(await getAnimeGraph(), type as "movie" | "tv", Number(id), type === "movie" ? 1 : Number(season), type === "movie" ? 1 : Number(episode))
            return reply.header("Cache-Control", "no-store").send({ match })
        } catch { return reply.code(503).send({ error: "Anime server lookup is unavailable. Try again shortly." }) }
    })
    app.get("/api/tmdb/*", async (request, reply) => {
        const path = request.url.slice("/api/tmdb".length)
        if (!/^\/3\/(movie|tv|search|discover|trending|genre|configuration|person|watch\/providers)(?:[/?]|$)/.test(path)) return reply.code(404).send({ error: "Unknown metadata endpoint" })
        if (!metadataToken) return reply.code(503).send({ status_message: "Metadata is not configured", success: false })
        try {
            const upstream = new URL(path, "https://api.themoviedb.org")
            upstream.searchParams.delete("api_key")
            const response = await publicFetch(upstream, { headers: { Authorization: `Bearer ${metadataToken}` }, signal: AbortSignal.timeout(20000) })
            return reply.code(response.status).header("Cache-Control", "no-store").send(await response.json())
        } catch { return reply.code(502).send({ status_message: "Metadata is temporarily unavailable. Try again.", success: false }) }
    })
    app.get("/api/cinepro/*", async (request, reply) => {
        const path = request.url.slice("/api/cinepro".length)
        if (!/^\/v1(?:\/health|\/movies\/\d+|\/tv\/\d+\/seasons\/\d+\/episodes\/\d+|\/refresh\/[a-zA-Z0-9_-]+)?$/.test(path)) return reply.code(404).send({ error: { message: "Unknown CinePro endpoint" } })
        if (!coreUrl) return reply.code(503).send({ error: { message: "Playback service is not configured" } })
        try {
            const response = await fetch(`${coreUrl.replace(/\/$/, "")}${path}`, { headers: coreToken ? { Authorization: `Bearer ${coreToken}` } : {}, redirect: "error", signal: AbortSignal.timeout(180000) })
            const data = await response.json() as Record<string, any>
            if (Array.isArray(data.sources)) data.sources = data.sources.flatMap((source: any) => {
                try { return [exposeSource(source)] } catch { return [] }
            })
            if (Array.isArray(data.subtitles)) data.subtitles = data.subtitles.flatMap((source: any) => {
                try { return [{ ...source, url: ticket(source.url) }] } catch { return [] }
            })
            return reply.code(response.status).send(data)
        } catch { return reply.code(503).send({ error: { code: "UNAVAILABLE", message: "CinePro is unavailable or the source lookup timed out. Try again." } }) }
    })
    app.get<{ Params: { id: string } }>("/api/media/:id", async (request, reply) => {
        // Provider content must never execute as an application-origin document.
        reply.header("Content-Security-Policy", "sandbox; default-src 'none'").header("X-Content-Type-Options", "nosniff").header("Cache-Control", "no-store")
        const entry = tickets.get(request.params.id)
        if (!entry || entry.expires < Date.now()) return reply.code(410).send({ error: "This playback session expired. Reload the movie." })
        const controller = new AbortController()
        reply.raw.on("close", () => { if (!reply.raw.writableEnded) controller.abort() })
        try {
            const headers = { ...entry.headers, ...(request.headers.range ? { Range: request.headers.range } : {}) }
            const response = await publicFetch(entry.url, { headers, signal: controller.signal }, null)
            if (!response.ok) { await response.body?.cancel(); return reply.code(response.status).send({ error: "Media source unavailable" }) }
            const contentType = response.headers.get("content-type") || "application/octet-stream"
            if (/\b(?:html|xml|svg)\b/i.test(contentType)) {
                await response.body?.cancel()
                return reply.code(502).send({ error: "Unsupported media content" })
            }
            const base = response.url || entry.url
            if (/mpegurl/i.test(contentType) || /\.m3u8(?:[?#]|$)/i.test(base)) {
                const body = await response.text()
                if (body.length > 2_000_000 || !body.trimStart().startsWith("#EXTM3U")) return reply.code(502).send({ error: "Invalid media playlist" })
                const rewritten = body.split(/\r?\n/).map(line => {
                    if (!line.trim()) return line
                    if (!line.startsWith("#")) return ticket(new URL(line.trim(), base).href, entry.headers)
                    return line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${ticket(new URL(uri, base).href, entry.headers)}"`)
                }).join("\n")
                return reply.type("application/vnd.apple.mpegurl").header("Cache-Control", "no-store").send(rewritten)
            }
            for (const header of ["content-range", "accept-ranges", "content-length"]) {
                const value = response.headers.get(header); if (value) reply.header(header, value)
            }
            return reply.code(response.status).type(contentType).send(Readable.fromWeb(response.body as any))
        } catch { if (!reply.sent) return reply.code(502).send({ error: "Media source could not be read. Try another source." }) }
    })
}
