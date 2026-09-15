import React, { createContext, useContext, useState, useCallback, useMemo } from "react"
import type { PlayerState } from "../types/player.types"
import type { UnifiedMedia } from "../types/media.types"
import type { NormalizedSource, NormalizedSubtitle, NormalizedAudioTrack } from "../types/source.types"

interface MediaWatchContextType {
    state: PlayerState
    setMedia: (media: UnifiedMedia | null) => void
    setIsPlaying: (isPlaying: boolean) => void
    setIsLoading: (isLoading: boolean) => void
    setError: (error?: string) => void
    setCurrentTime: (time: number) => void
    setDuration: (duration: number) => void
    setVolume: (volume: number) => void
    setIsMuted: (isMuted: boolean) => void
    setAutoplayEnabled: (enabled: boolean) => void

    selectSource: (source: NormalizedSource) => void
    selectSubtitle: (subtitle?: NormalizedSubtitle) => void
    selectAudioTrack: (track: NormalizedAudioTrack) => void
}

const MediaWatchContext = createContext<MediaWatchContextType | null>(null)

export function MediaWatchProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<PlayerState>({
        media: null,
        isPlaying: false,
        isLoading: true,
        currentTime: 0,
        duration: 0,
        volume: 1,
        isMuted: false,
        autoplayEnabled: true,
    })

    const setMedia = useCallback((media: UnifiedMedia | null) => {
        setState((prev) => ({ ...prev, media, isLoading: !!media }))
    }, [])

    const setIsPlaying = useCallback((isPlaying: boolean) => {
        setState((prev) => ({ ...prev, isPlaying }))
    }, [])

    const setIsLoading = useCallback((isLoading: boolean) => {
        setState((prev) => ({ ...prev, isLoading }))
    }, [])

    const setError = useCallback((error?: string) => {
        setState((prev) => ({ ...prev, error, isLoading: false }))
    }, [])

    const setCurrentTime = useCallback((currentTime: number) => {
        setState((prev) => ({ ...prev, currentTime }))
    }, [])

    const setDuration = useCallback((duration: number) => {
        setState((prev) => ({ ...prev, duration }))
    }, [])

    const setVolume = useCallback((volume: number) => {
        setState((prev) => ({ ...prev, volume }))
    }, [])

    const setIsMuted = useCallback((isMuted: boolean) => {
        setState((prev) => ({ ...prev, isMuted }))
    }, [])

    const setAutoplayEnabled = useCallback((autoplayEnabled: boolean) => {
        setState((prev) => ({ ...prev, autoplayEnabled }))
    }, [])

    const selectSource = useCallback((source: NormalizedSource) => {
        setState((prev) => {
            if (!prev.media) return prev
            return {
                ...prev,
                media: {
                    ...prev.media,
                    playback: {
                        ...prev.media.playback,
                        selectedSource: source,
                    },
                },
            }
        })
    }, [])

    const selectSubtitle = useCallback((subtitle?: NormalizedSubtitle) => {
        setState((prev) => {
            if (!prev.media) return prev
            return {
                ...prev,
                media: {
                    ...prev.media,
                    playback: {
                        ...prev.media.playback,
                        selectedSubtitle: subtitle,
                    },
                },
            }
        })
    }, [])

    const selectAudioTrack = useCallback((track: NormalizedAudioTrack) => {
        setState((prev) => {
            if (!prev.media) return prev
            return {
                ...prev,
                media: {
                    ...prev.media,
                    playback: {
                        ...prev.media.playback,
                        selectedAudioTrack: track,
                    },
                },
            }
        })
    }, [])

    const value = useMemo(
        () => ({
            state,
            setMedia,
            setIsPlaying,
            setIsLoading,
            setError,
            setCurrentTime,
            setDuration,
            setVolume,
            setIsMuted,
            setAutoplayEnabled,
            selectSource,
            selectSubtitle,
            selectAudioTrack,
        }),
        [state, setMedia, setIsPlaying, setIsLoading, setError, setCurrentTime, setDuration, setVolume, setIsMuted, setAutoplayEnabled, selectSource, selectSubtitle, selectAudioTrack]
    )

    return <MediaWatchContext.Provider value={value}>{children}</MediaWatchContext.Provider>
}

export function useMediaWatchContext() {
    const context = useContext(MediaWatchContext)
    if (!context) {
        throw new Error("useMediaWatchContext must be used within MediaWatchProvider")
    }
    return context
}
