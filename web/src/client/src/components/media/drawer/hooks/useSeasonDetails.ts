import { useCallback, useEffect, useState } from "react"
import { useTmdb } from "@/hooks/use-tmdb"
import { getSeasonDetails } from "../services/media.service"
import { mapEpisodes } from "../mappers/media.mapper"
import type { MediaEpisode } from "../types/media.types"

export function useSeasonDetails(tvId: number, seasonNumber: number) {
    const tmdb = useTmdb()
    const [episodes, setEpisodes] = useState<MediaEpisode[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)

    const fetchSeason = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const season = await getSeasonDetails(tmdb, tvId, seasonNumber)
            setEpisodes(mapEpisodes(season))
        } catch (err) {
            setError(err instanceof Error ? err : new Error("Failed to fetch season details"))
        } finally {
            setIsLoading(false)
        }
    }, [tmdb, tvId, seasonNumber])

    useEffect(() => {
        if (tvId && seasonNumber !== undefined) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            fetchSeason()
        }
    }, [fetchSeason, tvId, seasonNumber])

    return { episodes, isLoading, error, refetch: fetchSeason }
}
