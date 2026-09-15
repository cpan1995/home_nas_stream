import { readFile, mkdir, writeFile, rename } from "node:fs/promises"
import { dirname, resolve } from "node:path"

type Ranges = Record<string, string>
export type AnimeGraph = Record<string, Record<string, Ranges>>
const sourceUrl = "https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json"
const cacheFile = resolve("data/anime-mappings-v3.json")
const freshFor = 24 * 60 * 60 * 1000
let cached: { fetchedAt: number; graph: AnimeGraph } | undefined
let loading: Promise<AnimeGraph> | undefined
let retryAt = 0

// Keep only TMDB -> AniList edges; no title guessing or season-number reuse.
export function compactGraph(value: unknown): AnimeGraph {
    const graph: AnimeGraph = {}
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid mapping data")
    for (const [key, targets] of Object.entries(value)) {
        if (!/^tmdb_(movie:[1-9]\d*|show:[1-9]\d*:s\d+)$/.test(key) || !targets || typeof targets !== "object") continue
        for (const [target, ranges] of Object.entries(targets)) {
            if (!/^anilist:[1-9]\d*$/.test(target) || !ranges || typeof ranges !== "object" || Array.isArray(ranges)) continue
            if (Object.entries(ranges).some(([from, to]) => !/^\d+(?:-\d*)?$/.test(from) || typeof to !== "string" || to.length > 1000)) continue
            ;(graph[key] ||= {})[target] = ranges as Ranges
        }
    }
    return graph
}
function range(value: string): [number, number] | null {
    const match = /^(\d+)(?:-(\d*))?$/.exec(value)
    if (!match) return null
    const start = Number(match[1]), end = match[2] === "" ? Infinity : match[2] === undefined ? start : Number(match[2])
    return Number.isSafeInteger(start) && start > 0 && end >= start && (end === Infinity || Number.isSafeInteger(end)) ? [start, end] : null
}
export function resolveAnimeEpisode(graph: AnimeGraph, type: "movie" | "tv", id: number, season = 1, episode = 1) {
    const key = type === "movie" ? `tmdb_movie:${id}` : `tmdb_show:${id}:s${season}`
    const matches = new Map<string, { anilistId: number; episode: number }>()
    for (const [target, ranges] of Object.entries(graph[key] || {})) {
        for (const [from, to] of Object.entries(ranges)) {
            const source = range(from)
            if (!source || episode < source[0] || episode > source[1]) continue
            const [segments, ratio] = to.split("|")
            // Split/combined episodes need a different playback flow; don't choose
            // one arbitrarily or start midway through an episode.
            if (ratio !== undefined && ratio !== "1") continue
            let offset = episode - source[0]
            const targets = segments.split(",").map(range)
            if (targets.some(r => !r)) continue
            for (const segment of targets) {
                const [start, end] = segment!
                if (offset <= end - start) {
                    const anilistId = Number(target.slice(8)), mappedEpisode = start + offset
                    if (Number.isSafeInteger(anilistId) && anilistId > 0 && Number.isSafeInteger(mappedEpisode))
                        matches.set(`${anilistId}:${mappedEpisode}`, { anilistId, episode: mappedEpisode })
                    break
                }
                offset -= end - start + 1
            }
        }
    }
    // Ambiguous or ID-only mappings must never silently load the wrong episode.
    return matches.size === 1 ? [...matches.values()][0] : null
}
export async function getAnimeGraph(): Promise<AnimeGraph> {
    if (cached && Date.now() - cached.fetchedAt < freshFor) return cached.graph
    if (loading) return loading
    if (Date.now() < retryAt) {
        if (cached) return cached.graph
        throw Error("Anime mappings temporarily unavailable")
    }
    loading = (async () => {
        if (!cached) {
            try {
                const saved = JSON.parse(await readFile(cacheFile, "utf8"))
                if (Number.isFinite(saved.fetchedAt)) cached = { fetchedAt: saved.fetchedAt, graph: compactGraph(saved.graph) }
                if (cached && Date.now() - cached.fetchedAt < freshFor) return cached.graph
            } catch { /* First run or damaged cache: fetch a fresh dataset. */ }
        }
        try {
            const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000) })
            if (!response.ok) throw Error("Mapping download failed")
            const reader = response.body!.getReader(), chunks: Uint8Array[] = []
            let bytes = 0
            for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                bytes += value.byteLength
                if (bytes > 30_000_000) { await reader.cancel(); throw Error("Mapping download too large") }
                chunks.push(value)
            }
            const graph = compactGraph(JSON.parse(Buffer.concat(chunks).toString("utf8")))
            if (!Object.keys(graph).length) throw Error("Empty mapping data")
            cached = { fetchedAt: Date.now(), graph }
            try {
                await mkdir(dirname(cacheFile), { recursive: true })
                await writeFile(cacheFile + ".tmp", JSON.stringify(cached))
                await rename(cacheFile + ".tmp", cacheFile)
            } catch { /* Memory cache still works if local storage is unavailable. */ }
            return graph
        } catch (error) {
            retryAt = Date.now() + 60000
            if (cached) return cached.graph
            throw error
        }
    })().finally(() => { loading = undefined })
    return loading
}
