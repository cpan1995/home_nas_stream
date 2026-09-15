import { useMediaWatchContext } from "../providers/MediaWatchProvider"

export function usePlayerState() {
    const { state, setIsPlaying, setIsLoading, setError, setCurrentTime, setDuration, setVolume, setIsMuted, setAutoplayEnabled } = useMediaWatchContext()

    return {
        ...state,
        setIsPlaying,
        setIsLoading,
        setError,
        setCurrentTime,
        setDuration,
        setVolume,
        setIsMuted,
        setAutoplayEnabled,
    }
}
