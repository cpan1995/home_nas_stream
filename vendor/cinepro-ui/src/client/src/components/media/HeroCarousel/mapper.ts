import type { DetailedMedia, HeroSlide } from "./types"

export function toHeroSlides(mediaItems: DetailedMedia[]): HeroSlide[] {
    return mediaItems
        .filter((media) => media.images?.backdrops?.length || media.images?.posters?.length)
        .slice(0, 10)
        .map((media, index) => {
            const isMovie = "title" in media

            const title = isMovie ? media.title : media.name

            const year = isMovie ? media.release_date : media.first_air_date

            return {
                id: media.id,
                type: isMovie ? "movie" : "tv",
                title,
                year,
                rating: media.vote_average ? media.vote_average.toFixed(1) : "N/A",
                description: media.overview || "No description available.",
                image: media.backdrop_path ?? media.images.backdrops[0].file_path,
                badge: index >= 6 ? "Popular" : index >= 3 ? "Trending" : "New",
                runtime: isMovie ? (media.runtime ? `${media.runtime}m` : "") : media.episode_run_time?.[0] ? `${media.episode_run_time[0]}m` : (media.status ?? ""),
                logo: media.images.logos[0].file_path,
            }
        })
}
