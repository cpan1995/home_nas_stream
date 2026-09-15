import type { MovieDetails, TVSeriesDetails, TVEpisode } from "@lorenzopant/tmdb"
import type { UnifiedMedia } from "../types/media.types"
import type { PlaybackBundle } from "../types/player.types"

export function mapMovieToUnified(movie: MovieDetails, playback: PlaybackBundle): UnifiedMedia {
    return {
        id: movie.id.toString(),
        type: "movie",
        title: movie.title,
        overview: movie.overview ?? "No overview available.",
        posterUrl: movie.poster_path ?? "",
        backdropUrl: movie.backdrop_path ?? "",
        releaseDate: movie.release_date,
        runtime: movie.runtime,
        playback,
    }
}

export function mapTvEpisodeToUnified(show: TVSeriesDetails, episode: TVEpisode, playback: PlaybackBundle): UnifiedMedia {
    return {
        id: show.id.toString(),
        type: "tv",
        title: show.name,
        overview: episode.overview || show.overview || "No overview available.",
        posterUrl: show.poster_path ?? "",
        backdropUrl: episode.still_path ?? "",
        releaseDate: episode.air_date,
        seasonNumber: episode.season_number,
        episodeNumber: episode.episode_number,
        episodeTitle: episode.name,
        playback,
    }
}
