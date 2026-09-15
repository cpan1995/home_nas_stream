import { useTmdb } from "@/hooks/use-tmdb"
import { HeroCarousel } from "@/components/media/HeroCarousel/HeroCarousel"
import { HeroFade } from "@/components/media/HeroCarousel/HeroFade"
import { TvRail } from "@/components/media/MediaRail/TypedRails.tsx"
import { useCallback, useEffect, useState } from "react"
import type { Genre, TrendingParams } from "@lorenzopant/tmdb"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx"

export default function Shows() {
    const tmdb = useTmdb()
    const [trendingRange, setTrendingRange] = useState<TrendingParams>({ time_window: "day" })
    const [genres, setGenres] = useState<Genre[]>([])
    const [selectedGenre, setSelectedGenre] = useState<Genre | null>(null)

    useEffect(() => {
        let mounted = true

        async function loadGenres() {
            try {
                const data = await tmdb.genres.tv_list()
                if (mounted) {
                    setGenres(data.genres)
                    setSelectedGenre(data.genres[0])
                }
            } catch (e) {
                console.error(e)
            }
        }

        loadGenres()

        return () => {
            mounted = false
        }
    }, [tmdb.genres])

    // Performance reason: stable fetcher identities so switching the trending range or
    // genre doesn't re-trigger network fetches for the unrelated rails below.
    const fetchHero = useCallback(() => Promise.all([tmdb.tv_lists.popular()]), [tmdb])
    const fetchTrending = useCallback(() => tmdb.trending.tv(trendingRange), [tmdb, trendingRange])
    const fetchByGenre = useCallback(() => tmdb.discover.tv({ with_genres: selectedGenre?.id }), [tmdb, selectedGenre])
    const fetchPopular = useCallback(() => tmdb.tv_lists.popular({}), [tmdb])
    const fetchTopRated = useCallback(() => tmdb.tv_lists.top_rated(), [tmdb])

    return (
        <div className="min-h-screen overflow-hidden">
            <HeroCarousel tmdb={tmdb} fetcher={fetchHero} />

            <HeroFade />

            <section className="flex flex-col gap-8 bg-background p-8">
                <TvRail
                    title={
                        <div className={"flex items-center justify-between"}>
                            <h2 className="text-2xl font-semibold">Trending TV Shows</h2>
                            <div className="ml-4 flex items-center gap-2">
                                <Button onClick={() => setTrendingRange({ time_window: "day" })} variant={trendingRange.time_window === "day" ? "default" : "secondary"}>
                                    Today
                                </Button>
                                <Button onClick={() => setTrendingRange({ time_window: "week" })} variant={trendingRange.time_window === "week" ? "default" : "secondary"}>
                                    This Week
                                </Button>
                            </div>
                        </div>
                    }
                    fetcher={fetchTrending}
                />

                <TvRail
                    title={
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-semibold">{selectedGenre ? `${selectedGenre.name} Shows` : "Select Genre"}</h2>

                            <Select
                                value={selectedGenre?.id?.toString()}
                                onValueChange={(value) => {
                                    const genre = genres.find((g) => g.id.toString() === value)

                                    if (genre) {
                                        setSelectedGenre(genre)
                                    }
                                }}
                            >
                                <SelectTrigger className="w-55">
                                    <SelectValue placeholder="Select Genre" />
                                </SelectTrigger>

                                <SelectContent>
                                    <SelectGroup>
                                        {genres.map((genre) => (
                                            <SelectItem key={genre.id} value={genre.id.toString()}>
                                                {genre.name}
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>
                    }
                    fetcher={fetchByGenre}
                />

                <TvRail title="Popular TV Shows" fetcher={fetchPopular} />

                <TvRail title="Top Rated TV Shows" fetcher={fetchTopRated} />
            </section>
        </div>
    )
}
