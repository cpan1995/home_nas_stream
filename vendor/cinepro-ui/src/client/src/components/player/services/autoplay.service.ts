import { TMDB } from "@lorenzopant/tmdb"
import { tmdbService } from "./tmdb.service"

export const autoplayService = {
    getNextEpisode: async (tmdb: TMDB, showId: string, seasonNumber: number, episodeNumber: number) => {
        const currentSeason = await tmdbService.getSeasonDetails(tmdb, showId, seasonNumber)
        const nextEpisode = currentSeason.episodes.find((e) => e.episode_number === episodeNumber + 1)

        if (nextEpisode) {
            return { season: seasonNumber, episode: episodeNumber + 1 }
        }

        // 2. Check if next season exists
        const show = await tmdbService.getTvDetails(tmdb, showId)
        if (!show.seasons) return null
        const nextSeason = show.seasons.find((s) => s.season_number === seasonNumber + 1)

        if (nextSeason) {
            // Return first episode of next season
            return { season: seasonNumber + 1, episode: 1 }
        }

        return null
    },
}
