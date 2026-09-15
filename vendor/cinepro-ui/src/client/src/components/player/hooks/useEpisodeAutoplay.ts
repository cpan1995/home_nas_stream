import { useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useTmdb } from "@/hooks/use-tmdb"
import { usePlayerState } from "./usePlayerState"
import { autoplayService } from "../services/autoplay.service"

export function useEpisodeAutoplay() {
    const { media, autoplayEnabled } = usePlayerState()
    const tmdb = useTmdb()
    const navigate = useNavigate()

    const handleEpisodeEnded = useCallback(async () => {
        if (!autoplayEnabled || !media || media.type !== "tv" || media.seasonNumber === undefined || media.episodeNumber === undefined) {
            return
        }

        const next = await autoplayService.getNextEpisode(tmdb, media.id, media.seasonNumber, media.episodeNumber)

        if (next) {
            navigate(`/watch/tv/${media.id}?s=${next.season}&e=${next.episode}`)
        }
    }, [media, autoplayEnabled, tmdb, navigate])

    return { handleEpisodeEnded }
}
