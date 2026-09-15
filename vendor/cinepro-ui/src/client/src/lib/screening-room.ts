import { streamCatalog } from "./stream-providers.generated"

const requested = new URLSearchParams(location.search).get("screeningRoom")
if (requested === "1") sessionStorage.setItem("screeningRoom", "1")
export const screeningRoom = sessionStorage.getItem("screeningRoom") === "1"

export const screeningServers = streamCatalog.providers.filter(server => server.enabled).map(server => ({
    ...server, origin: server.origin === "@local" ? location.origin : server.origin,
}))

function validateMedia(id: string, season?: number, episode?: number) {
    if (!/^[1-9]\d*$/.test(id)) throw Error("Invalid movie ID")
    if (season !== undefined || episode !== undefined) {
        if (!Number.isSafeInteger(season) || !Number.isSafeInteger(episode) || season! < 1 || episode! < 1)
            throw Error("Invalid season or episode")
    }
}
function route(origin: string, template: string, values: Record<string, string | number>) {
    const path = template.replace(/\{([a-z]+)\}/g, (_, key: string) => {
        if (values[key] === undefined) throw Error("Missing provider route value")
        return encodeURIComponent(String(values[key]))
    })
    return origin + path
}
export function moviesApiUrl(id: string, season?: number, episode?: number) {
    validateMedia(id, season, episode)
    const provider = screeningServers.find(server => server.id === "moviesapi")
    const template = season === undefined ? provider?.moviePath : provider?.tvPath
    if (!provider || !template) throw Error("MoviesAPI is disabled or unconfigured")
    return route(provider.origin, template, { id, season: season || 1, episode: episode || 1 })
}
export function screeningServerSources(id: string, season?: number, episode?: number) {
    validateMedia(id, season, episode)
    return screeningServers.flatMap(server => {
        const template = season === undefined ? server.moviePath : server.tvPath
        return template ? [{
            url: route(server.origin, template, { id, season: season || 1, episode: episode || 1 }),
            type: "embed" as const, quality: "unknown", audioTracks: [], provider: { id: server.id, name: server.name },
        }] : []
    })
}
export function isScreeningServer(value: string) {
    try {
        const url = new URL(value)
        return screeningServers.some(server => server.origin === url.origin &&
            (server.id !== "miruro" || /^\/anime-player\/[1-9]\d*\/[1-9]\d*\/(sub|dub)$/.test(url.pathname)))
    } catch { return false }
}
export function animeServerSources(anilistId: number, episode: number) {
    if (![anilistId, episode].every(n => Number.isSafeInteger(n) && n > 0)) throw Error("Invalid anime episode")
    return screeningServers.filter(server => server.animePath).flatMap(server =>
        server.languages.map(language => ({
            url: route(server.origin, server.animePath!, { id: anilistId, episode, language, dub: language === "dub" ? "true" : "false" }),
            type: "embed" as const, quality: "unknown", audioTracks: [],
            provider: {
                id: server.singleAudio ? `${server.id}-anime` : `${server.id}-anime-${language}`,
                name: server.singleAudio ? `${server.name} · Anime` : `${server.name} · Anime ${language}`,
            },
        })))
}
export function screeningServerIssue(providerId: string): string | undefined {
    const server = screeningServers.find(server => providerId.startsWith(`${server.id}-anime`))
    return server?.animeIssue || undefined
}
export function screeningManualFallback(providerId: string) {
    const server = screeningServers.find(server => providerId.startsWith(`${server.id}-anime`))
    return !!server?.manualAnime && !server.autoVariants.some(language => providerId === `${server.id}-anime-${language}`)
}
