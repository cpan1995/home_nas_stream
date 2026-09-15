import { useEffect, useMemo, useState } from "react"
import type { MovieDetails, TVEpisodeItem } from "@lorenzopant/tmdb"
import { getHistoryKey, mergeHistory } from "@/lib/history.utlis"
import { HistoryContext } from "@/hooks/use-history.ts"

declare type TVShowTitleType = {
    tvshowtitle: string
}

export type HistoryItem =
    | {
          kind: "movie"
          item: MovieDetails
      }
    | {
          kind: "tvShow"
          item: TVEpisodeItem & TVShowTitleType
      }

const MAX_HISTORY = 100

export type HistoryContextType = {
    history: HistoryItem[]
    addMovie: (movie: MovieDetails) => void
    addEpisode: (episode: TVEpisodeItem & TVShowTitleType) => void
    remove: (item: HistoryItem) => void
    clear: () => void
}

const HISTORY_KEY = "app.history"

export function HistoryProvider({ children }: { children: React.ReactNode }) {
    const [history, setHistory] = useState<HistoryItem[]>(() => {
        if (typeof window === "undefined") return []

        try {
            const stored = localStorage.getItem(HISTORY_KEY)
            return stored ? (JSON.parse(stored) as HistoryItem[]) : []
        } catch {
            return []
        }
    })

    useEffect(() => {
        if (typeof window === "undefined") return

        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
        } catch {
            // ignore quota / private mode errors
        }
    }, [history])

    const value = useMemo<HistoryContextType>(() => {
        const addItems = (items: HistoryItem[]) => {
            setHistory((current) => mergeHistory(current, items).slice(0, MAX_HISTORY))
        }

        const addMovie = (movie: MovieDetails) => {
            addItems([{ kind: "movie", item: movie }])
        }

        const addEpisode = (episode: TVEpisodeItem & TVShowTitleType) => {
            addItems([{ kind: "tvShow", item: episode }])
        }

        const remove = (item: HistoryItem) => {
            setHistory((current) => current.filter((i) => getHistoryKey(i) !== getHistoryKey(item)))
        }

        const clear = () => {
            setHistory([])
        }

        return {
            history,
            addMovie,
            addEpisode,
            remove,
            clear,
        }
    }, [history])

    return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>
}
