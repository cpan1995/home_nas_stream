import type { PlaybackBundle } from "./player.types"

export type MediaType = "movie" | "tv"

export interface UnifiedMedia {
    id: string
    type: MediaType

    title: string
    overview: string

    posterUrl: string
    backdropUrl: string

    releaseDate?: string

    // TV-specific
    seasonNumber?: number
    episodeNumber?: number
    episodeTitle?: string

    runtime?: number

    playback: PlaybackBundle
}
