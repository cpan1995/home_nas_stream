import { useEffect, useState } from "react"
import { useOmss } from "@/hooks/use-omss"
import { omssService } from "../services/omss.service"
import type { MediaType } from "../types/media.types"
import type { LocalSourceResponse } from "../types/source.types"

export function useMediaSources(id: string, type: MediaType, season?: number, episode?: number) {
    const { client } = useOmss()
    const [sources, setSources] = useState<LocalSourceResponse | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string>()

    useEffect(() => {
        let active = true
        if (!id) return
        async function fetchSources() {
            setIsLoading(true)
            setError(undefined)
            try {
                if (type === "movie") {
                    const res = await omssService.getMovieSources(client, id)
                    if (active) setSources(res)
                } else if (season !== undefined && episode !== undefined) {
                    const res = await omssService.getTvSources(client, id, season, episode)
                    if (active) setSources(res)
                }
            } catch (e) {
                if (active) setError(e instanceof Error ? e.message : String(e))
            } finally {
                if (active) setIsLoading(false)
            }
        }

        void fetchSources()
        return () => { active = false }
    }, [id, type, season, episode, client])

    return { sources, isLoading, error }
}
