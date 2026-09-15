import type { Source, SourceResponse, SourceType, SubtitleFormat } from "@omss/sdk"

export type LocalSource = Omit<Source, "type"> & { type: SourceType | "embed" }
export type LocalSourceResponse = Omit<SourceResponse, "sources"> & { sources: LocalSource[] }

export interface NormalizedSource {
    url: string
    type: SourceType | "embed"
    quality: string
    provider: {
        id: string
        name: string
    }
    audioTracks: NormalizedAudioTrack[]
}

export interface NormalizedSubtitle {
    url: string
    label: string
    format: SubtitleFormat
}

export interface NormalizedAudioTrack {
    language: string
    label: string
}
