import type { Subtitle, AudioTrack } from "@omss/sdk"
import type { LocalSource } from "../types/source.types"
import type { NormalizedSource, NormalizedSubtitle, NormalizedAudioTrack } from "../types/source.types"

export function mapSource(source: LocalSource): NormalizedSource {
    return {
        url: source.url,
        type: source.type,
        quality: source.quality,
        provider: {
            id: source.provider.id,
            name: source.provider.name,
        },
        audioTracks: (source.audioTracks || []).map(mapAudioTrack),
    }
}

export function mapSubtitle(subtitle: Subtitle): NormalizedSubtitle {
    return {
        url: subtitle.url,
        label: subtitle.label,
        format: subtitle.format,
    }
}

export function mapAudioTrack(audioTrack: AudioTrack): NormalizedAudioTrack {
    return {
        language: audioTrack.language,
        label: audioTrack.label,
    }
}
