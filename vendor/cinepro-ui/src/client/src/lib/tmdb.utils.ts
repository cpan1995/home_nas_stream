import type { CountryISO3166_1 } from "@lorenzopant/tmdb"

export function getCountry(): CountryISO3166_1 | undefined {
    try {
        const locale = new Intl.Locale(navigator.language)
        if (locale.region && /^[A-Z]{2}$/.test(locale.region)) return locale.region as CountryISO3166_1
    } catch {
        // continue
    }

    const fallback = navigator.language.split("-")[1]
    if (fallback && /^[a-z]{2}$/i.test(fallback)) return fallback.toUpperCase() as CountryISO3166_1

    return undefined
}
