import { TMDB } from "@lorenzopant/tmdb"

export const tmdbService = {
    getMovieDetails: async (tmdb: TMDB, id: string) => {
        return await tmdb.movies.details({ movie_id: parseInt(id) })
    },

    getTvDetails: async (tmdb: TMDB, id: string) => {
        return await tmdb.tv_series.details({ series_id: parseInt(id) })
    },

    getEpisodeDetails: async (tmdb: TMDB, showId: string, season: number, episode: number) => {
        return await tmdb.tv_episodes.details({
            series_id: parseInt(showId),
            season_number: season,
            episode_number: episode,
        })
    },

    getSeasonDetails: async (tmdb: TMDB, showId: string, season: number) => {
        return await tmdb.tv_seasons.details({
            series_id: parseInt(showId),
            season_number: season,
        })
    },
}
