import { useMediaWatchContext } from "../providers/MediaWatchProvider"

export function useSubtitles() {
    const { state, selectSubtitle } = useMediaWatchContext()

    return {
        subtitles: state.media?.playback.subtitles.sort((a, b) => a.label.localeCompare(b.label)) || [],
        selectedSubtitle: state.media?.playback.selectedSubtitle,
        selectSubtitle,
    }
}
