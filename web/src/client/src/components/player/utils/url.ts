import { TMDB_IMAGE_BASE_URL, POSTER_SIZES, BACKDROP_SIZES } from "../constants/tmdb"

export function getTMDBImageUrl(path: string | undefined, size: keyof typeof POSTER_SIZES | keyof typeof BACKDROP_SIZES = "original") {
    if (!path) return ""
    const sizeValue = (POSTER_SIZES as Record<string, string>)[size] || (BACKDROP_SIZES as Record<string, string>)[size] || size
    return `${TMDB_IMAGE_BASE_URL}${sizeValue}${path}`
}
