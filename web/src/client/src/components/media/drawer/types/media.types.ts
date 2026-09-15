export interface MediaNormalized {
    id: number
    type: "movie" | "tv"
    title: string
    overview: string
    releaseDate: string
    rating: number
    voteCount: number
    runtime?: number
    genres: string[]
    backdropUrl: string | null
    posterUrl: string | null
    logoUrl: string | null
    trailer: string | null
    cast: MediaCast[]
    recommendations: MediaRecommendation[]
    seasons?: MediaSeason[]
}

export interface MediaCast {
    id: number
    name: string
    character: string
    profileUrl: string | null
}

export interface MediaRecommendation {
    id: number
    type: "movie" | "tv"
    title: string
    posterUrl: string | null
    backdropUrl: string | null
    rating: number
}

export interface MediaSeason {
    id: number
    seasonNumber: number
    name: string
    episodeCount: number
    posterUrl: string | null
    airDate: string
}

export interface MediaEpisode {
    id: number
    episodeNumber: number
    name: string
    overview: string
    stillUrl: string | null
    airDate: string
    runtime: number | null
}
