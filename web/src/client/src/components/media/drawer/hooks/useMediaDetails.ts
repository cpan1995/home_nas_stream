import { useCallback, useEffect, useState } from "react"
import { useTmdb } from "@/hooks/use-tmdb"
import { getMovieDetails, getTVDetails } from "../services/media.service"
import { mapMedia } from "../mappers/media.mapper"
import type { MediaNormalized } from "../types/media.types"

export function useMediaDetails(type: "movie" | "tv", id: number) {
    const tmdb = useTmdb()
    const [data, setData] = useState<MediaNormalized | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)

    const fetchDetails = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const details = type === "movie" ? await getMovieDetails(tmdb, id) : await getTVDetails(tmdb, id)
            setData(mapMedia(details, type))
        } catch (err) {
            setError(err instanceof Error ? err : new Error("Failed to fetch details"))
        } finally {
            setIsLoading(false)
        }
    }, [tmdb, type, id])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchDetails()
    }, [fetchDetails])

    return { data, isLoading, error, refetch: fetchDetails }
}
