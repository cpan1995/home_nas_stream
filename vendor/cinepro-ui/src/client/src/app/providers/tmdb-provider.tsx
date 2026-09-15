import React, { useMemo } from "react"
import { TMDB } from "@lorenzopant/tmdb"
import { TmdbContext } from "@/hooks/use-tmdb"
import { useAppSettings } from "@/hooks/use-appsettings"

export function TMDBProvider({ children }: { children: React.ReactNode }) {
    const { tmdbApiKey, tmdbOptions } = useAppSettings()

    const language = tmdbOptions.language
    const region = tmdbOptions.region
    const timezone = tmdbOptions.timezone
    const cache = tmdbOptions.cache
    const images = tmdbOptions.images

    const tmdb = useMemo(
        () => new TMDB(tmdbApiKey, { language, region, timezone, cache, images }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [tmdbApiKey, language, region, timezone, cache]
    )

    return <TmdbContext.Provider value={{ tmdb }}>{children}</TmdbContext.Provider>
}
