import { useEffect, useState } from "react"
import { useTmdb } from "@/hooks/use-tmdb"
import { tmdbService } from "../services/tmdb.service"
import type { MediaType } from "../types/media.types"
import type { MovieDetails, TVSeriesDetails, TVEpisode } from "@lorenzopant/tmdb"

export function useMediaDetails(id: string, type: MediaType, season?: number, episode?: number) {
    const tmdb = useTmdb()
    const [details, setDetails] = useState<{
        movie?: MovieDetails
        show?: TVSeriesDetails
        episode?: TVEpisode
    }>({})
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string>()

    useEffect(() => {
        let active = true
        if (!id) return
        async function fetchDetails() {
            setIsLoading(true)
            setError(undefined)
            try {
                if (type === "movie") {
                    const movie = await tmdbService.getMovieDetails(tmdb, id)
                    if (active) setDetails({ movie })
                } else {
                    const show = await tmdbService.getTvDetails(tmdb, id)
                    let epDetails: TVEpisode | undefined
                    if (season !== undefined && episode !== undefined) {
                        epDetails = await tmdbService.getEpisodeDetails(tmdb, id, season, episode)
                    }
                    if (active) setDetails({ show, episode: epDetails })
                }
            } catch (e) {
                if (active) setError(e instanceof Error ? e.message : String(e))
            } finally {
                if (active) setIsLoading(false)
            }
        }

        void fetchDetails()
        return () => { active = false }
    }, [id, type, season, episode, tmdb])

    return { details, isLoading, error }
}
