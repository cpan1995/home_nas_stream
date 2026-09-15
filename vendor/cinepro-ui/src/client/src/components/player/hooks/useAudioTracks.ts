import { useMediaWatchContext } from "../providers/MediaWatchProvider"

export function useAudioTracks() {
    const { state, selectAudioTrack } = useMediaWatchContext()

    return {
        audioTracks: state.media?.playback.audioTracks || [],
        selectedAudioTrack: state.media?.playback.selectedAudioTrack,
        selectAudioTrack,
    }
}
