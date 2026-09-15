export interface EpisodeInfo {
    id: number
    name: string
    overview: string
    episodeNumber: number
    seasonNumber: number
    airDate?: string
    stillPath?: string
}

export interface SeasonInfo {
    id: number
    name: string
    seasonNumber: number
    episodes: EpisodeInfo[]
}
