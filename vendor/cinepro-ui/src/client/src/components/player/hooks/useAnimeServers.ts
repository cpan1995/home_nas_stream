import { useEffect, useState } from "react"
import { animeServerSources } from "@/lib/screening-room"
import type { UnifiedMedia } from "../types/media.types"

export function useAnimeServers(media: Pick<UnifiedMedia, "id" | "type" | "seasonNumber" | "episodeNumber">) {
    const { id, type, seasonNumber, episodeNumber } = media
    const key = `${type}:${id}:${seasonNumber}:${episodeNumber}`
    const [attempt, retry] = useState(0)
    const [result, setResult] = useState({ key: "", sources: [] as ReturnType<typeof animeServerSources>, loading: true, error: "" })
    useEffect(() => {
        if (!id) { setResult({ key, sources: [], loading: false, error: "" }); return }
        const controller = new AbortController()
        setResult({ key, sources: [], loading: true, error: "" })
        const timeout = setTimeout(() => controller.abort(), 18000)
        let active = true
        void (async () => {
            try {
                const query = type === "tv" ? `?season=${seasonNumber ?? 1}&episode=${episodeNumber ?? 1}` : ""
                const response = await fetch(`/api/anime/resolve/${type}/${encodeURIComponent(id)}${query}`, { signal: controller.signal })
                if (!response.ok) throw Error("Anime servers could not be checked. Try again.")
                const { match } = await response.json()
                const sources = match ? animeServerSources(match.anilistId, match.episode) : []
                if (active) setResult({ key, sources, loading: false, error: "" })
            } catch {
                if (active) setResult({ key, sources: [], loading: false, error: "Anime servers could not be checked. Try again." })
            } finally { clearTimeout(timeout) }
        })()
        return () => { active = false; clearTimeout(timeout); controller.abort() }
    }, [key, id, type, seasonNumber, episodeNumber, attempt])
    return { ...(result.key === key ? result : { sources: [], loading: true, error: "" }), retry: () => retry(n => n + 1) }
}
