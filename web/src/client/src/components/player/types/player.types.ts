import type { NormalizedAudioTrack, NormalizedSource, NormalizedSubtitle } from "./source.types"
import type { UnifiedMedia } from "./media.types"

export interface PlaybackBundle {
    sources: NormalizedSource[]
    subtitles: NormalizedSubtitle[]
    audioTracks: NormalizedAudioTrack[]

    selectedSource?: NormalizedSource
    selectedSubtitle?: NormalizedSubtitle
    selectedAudioTrack?: NormalizedAudioTrack

    drm?: boolean
}

export interface PlayerState {
    media: UnifiedMedia | null

    isPlaying: boolean
    isLoading: boolean
    error?: string

    currentTime: number
    duration: number

    volume: number
    isMuted: boolean

    autoplayEnabled: boolean
}
