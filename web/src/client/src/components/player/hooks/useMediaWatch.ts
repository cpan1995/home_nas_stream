import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import type { MediaType } from "../types/media.types"
import { useMediaDetails } from "./useMediaDetails"
import { useMediaSources } from "./useMediaSources"
import { mapMovieToUnified, mapTvEpisodeToUnified } from "../mappers/media.mapper"
import { mapPlaybackResponse } from "../mappers/playback.mapper"
import { useMediaWatchContext } from "../providers/MediaWatchProvider"

export function useMediaWatch(id: string, type: MediaType, season?: number, episode?: number) {
    const { setMedia, setError, setIsLoading } = useMediaWatchContext()
    const { t } = useTranslation("player")
    const { details, isLoading: detailsLoading, error: detailsError } = useMediaDetails(id, type, season, episode)
    const { sources, isLoading: sourcesLoading, error: sourcesError } = useMediaSources(id, type, season, episode)

    useEffect(() => {
        if (detailsError || sourcesError) {
            setError(detailsError || sourcesError)
            return
        }

        if (!detailsLoading && !sourcesLoading && sources) {
            const playback = mapPlaybackResponse(sources)
            if (!playback.selectedSource) { setError("No playable sources were found. Try again later."); return }
            setError(undefined)

            let unified
            if (type === "movie" && details.movie) {
                unified = mapMovieToUnified(details.movie, playback)
            } else if (type === "tv" && details.show && details.episode) {
                unified = mapTvEpisodeToUnified(details.show, details.episode, playback)
            }

            if (unified) {
                setMedia(unified)
                setIsLoading(false)
            } else {
                setError(t("states.error"))
            }
        }
    }, [details, sources, detailsLoading, sourcesLoading, detailsError, sourcesError, id, type, season, episode, t, setMedia, setError, setIsLoading])

    return {
        isLoading: detailsLoading || sourcesLoading,
        error: detailsError || sourcesError,
    }
}
