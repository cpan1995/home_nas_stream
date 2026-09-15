import { useCallback, useEffect, useRef, useState } from "react"
import { useTmdb } from "@/hooks/use-tmdb"
import { getSeasonDetails } from "../services/media.service"
import { mapEpisodes } from "../mappers/media.mapper"
import type { MediaEpisode } from "../types/media.types"

export function useSeasonDetails(tvId: number, seasonNumber: number) {
    const tmdb = useTmdb()
    const request = useRef(0)
    const [loadedKey, setLoadedKey] = useState("")
    const key = `${tvId}:${seasonNumber}`
    const [episodes, setEpisodes] = useState<MediaEpisode[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)

    const fetchSeason = useCallback(async () => {
        const version = ++request.current
        setIsLoading(true)
        setError(null)
        try {
            const season = await getSeasonDetails(tmdb, tvId, seasonNumber)
            if (version === request.current) setEpisodes(mapEpisodes(season))
        } catch (err) {
            if (version === request.current) { setEpisodes([]); setError(err instanceof Error ? err : new Error("Failed to fetch season details")) }
        } finally {
            if (version === request.current) { setLoadedKey(key); setIsLoading(false) }
        }
    }, [tmdb, tvId, seasonNumber, key])

    useEffect(() => {
        if (tvId && seasonNumber !== undefined) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            fetchSeason()
        }
        return () => { request.current++ }
    }, [fetchSeason, tvId, seasonNumber])

    return { episodes, isLoading: isLoading || loadedKey !== key, error, refetch: fetchSeason }
}
