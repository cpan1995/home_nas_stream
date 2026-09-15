import type { LocalSourceResponse } from "../types/source.types"
import type { PlaybackBundle } from "../types/player.types"
import { mapSource, mapSubtitle } from "./source.mapper"
import { getPreferredSource } from "../utils/playback"

export function mapPlaybackResponse(response: LocalSourceResponse): PlaybackBundle {
    const sources = (response.sources || []).map(mapSource)
    const subtitles = (response.subtitles || []).map(mapSubtitle)

    // Audio tracks are typically part of sources in OMSS
    // But we can extract them if needed, or just use them from the selected source
    const audioTracks = sources.length > 0 ? sources[0].audioTracks : []

    return {
        sources,
        subtitles,
        audioTracks,
        selectedSource: getPreferredSource(sources),
        selectedSubtitle: subtitles.length > 0 ? subtitles[0] : undefined,
        selectedAudioTrack: audioTracks.length > 0 ? audioTracks[0] : undefined,
    }
}
