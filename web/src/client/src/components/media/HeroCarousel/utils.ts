import type { HeroFetcherResult, MixedMediaItem } from "./types"

import type { TMDB } from "@lorenzopant/tmdb"
import { shuffle } from "@/lib/array.utils.ts"

export async function resolveHeroFetcher(fetcher: HeroFetcherResult): Promise<MixedMediaItem[]> {
    const lists = await fetcher()

    const movieList = lists.find(
        (list): list is Awaited<ReturnType<TMDB["movie_lists"][keyof TMDB["movie_lists"]] | TMDB["trending"]["movies"]>> => "results" in list && list.results.length > 0 && "title" in list.results[0]
    )

    const tvList = lists.find(
        (list): list is Awaited<ReturnType<TMDB["tv_lists"][keyof TMDB["tv_lists"]] | TMDB["trending"]["tv"]>> => "results" in list && list.results.length > 0 && "name" in list.results[0]
    )

    const mixed: MixedMediaItem[] = []

    const slicer = (movieList && !tvList) || (!movieList && tvList) ? 10 : 5

    if (movieList) movieList.results.slice(0, slicer).forEach((m) => mixed.push({ type: "movie", id: m.id }))

    if (tvList) tvList.results.slice(0, slicer).forEach((m) => mixed.push({ type: "tv", id: m.id }))

    return shuffle(mixed)
}

export async function fetchDetailedMedia(items: MixedMediaItem[], tmdb: TMDB) {
    return Promise.all(
        items.map((item) => {
            if (item.type === "movie") {
                return tmdb.movies.details({
                    movie_id: item.id,
                    append_to_response: ["images"],
                })
            }

            return tmdb.tv_series.details({
                series_id: item.id,
                append_to_response: ["images"],
            })
        })
    )
}
