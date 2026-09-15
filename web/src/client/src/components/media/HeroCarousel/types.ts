import type { MovieDetailsWithAppends, MovieResultItem, PaginatedResponse, TVDetailsWithAppends, TVSeriesResultItem } from "@lorenzopant/tmdb"

export type HeroSlide = {
    id: number
    type: "movie" | "tv"
    title: string
    year: string
    rating: string
    description: string
    image: string
    badge: string
    runtime: string
    logo: string
}

export type DetailedMedia = MovieDetailsWithAppends<"images"[]> | TVDetailsWithAppends<"images"[]>

export type MixedMediaItem = { type: "movie"; id: number } | { type: "tv"; id: number }

export type HeroFetcherResult = () => Promise<(PaginatedResponse<MovieResultItem> | PaginatedResponse<TVSeriesResultItem>)[]>
