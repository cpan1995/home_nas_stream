import type { MovieDetailsWithAppends, TVDetailsWithAppends, TVSeason } from "@lorenzopant/tmdb"
import { MOVIE_APPENDS, TV_APPENDS } from "../constants/tmdb"
import type { MediaCast, MediaEpisode, MediaNormalized, MediaRecommendation } from "../types/media.types"

export const mapMedia = (data: MovieDetailsWithAppends<typeof MOVIE_APPENDS> | TVDetailsWithAppends<typeof TV_APPENDS>, type: "movie" | "tv"): MediaNormalized => {
    const isMovie = type === "movie"
    const movieData = isMovie ? (data as MovieDetailsWithAppends<typeof MOVIE_APPENDS>) : null
    const tvData = !isMovie ? (data as TVDetailsWithAppends<typeof TV_APPENDS>) : null

    const trailer = data.videos?.results.find((v) => v.type === "Trailer" && v.site === "YouTube")?.key || null

    const cast: MediaCast[] =
        data.credits?.cast.slice(0, 10).map((c) => ({
            id: c.id,
            name: c.name,
            character: c.character,
            profileUrl: c.profile_path ?? `/favicon.svg`,
        })) || []

    const recommendations: MediaRecommendation[] =
        data.recommendations?.results.slice(0, 12).map((r) => ({
            id: r.id,
            type: ("media_type" in r ? r.media_type : isMovie ? "movie" : "tv") as "movie" | "tv",
            title: ("title" in r ? r.title : r.name) as string,
            posterUrl: r.poster_path ?? `/favicon.svg`,
            backdropUrl: r.backdrop_path ?? `/favicon.svg`,
            rating: r.vote_average,
        })) || []

    return {
        id: data.id,
        type,
        title: isMovie ? movieData!.title : tvData!.name,
        overview: data.overview ?? "",
        releaseDate: isMovie ? movieData!.release_date : tvData!.first_air_date,
        rating: data.vote_average,
        voteCount: data.vote_count,
        runtime: isMovie ? movieData!.runtime : tvData!.episode_run_time?.[0],
        genres: data.genres.map((g) => g.name),
        backdropUrl: data.backdrop_path ?? "/favicon.svg",
        posterUrl: data.poster_path ?? "/favicon.svg",
        logoUrl: data.images?.logos[0]?.file_path,
        trailer,
        cast,
        recommendations,
        seasons: tvData?.seasons?.map((s) => ({
            id: s.id,
            seasonNumber: s.season_number,
            name: s.name,
            episodeCount: s.episode_count,
            posterUrl: s.poster_path ?? `/favicon.svg`,
            airDate: s.air_date ?? "N/A",
        })),
    }
}

export const mapEpisodes = (season: TVSeason): MediaEpisode[] => {
    return season.episodes.map((e) => ({
        id: e.id,
        episodeNumber: e.episode_number,
        name: e.name,
        overview: e.overview,
        stillUrl: e.still_path?.replace("w300", "original") ?? `/favicon.svg`,
        airDate: e.air_date ?? "N/A",
        runtime: e.runtime ?? 0,
    }))
}

export function formatRuntime(runtime?: number) {
    if (!runtime) return null

    const hours = Math.floor(runtime / 60)
    const minutes = runtime % 60

    return `${hours}h ${minutes}m`
}
