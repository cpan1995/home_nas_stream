import { createContext, useContext } from "react"
import { type CountryISO3166_1, TMDB } from "@lorenzopant/tmdb"
import countries from "i18n-iso-countries"
import enLocale from "i18n-iso-countries/langs/en.json"

countries.registerLocale(enLocale)

export const supportedRegions = (Object.keys(countries.getAlpha2Codes()) as CountryISO3166_1[]).map((code) => ({
    value: code,
    label: countries.getName(code, "en") ?? code,
}))

type TmdbContextType = { tmdb: TMDB }

export const TmdbContext = createContext<TmdbContextType | null>(null)

export function useTmdb() {
    const context = useContext(TmdbContext)
    if (!context) {
        throw new Error("useTmdb must be used within TMDBProvider")
    }
    return context.tmdb
}
