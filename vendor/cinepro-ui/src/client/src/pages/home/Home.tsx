import { useCallback } from "react"
import { useTmdb } from "@/hooks/use-tmdb"
import { HeroCarousel } from "@/components/media/HeroCarousel/HeroCarousel"
import { HeroFade } from "@/components/media/HeroCarousel/HeroFade"
import { MovieRail, TvRail } from "@/components/media/MediaRail/TypedRails.tsx"

export function HomePage() {
    const tmdb = useTmdb()

    // Performance reason: stable fetcher identities stop MediaRail/HeroCarousel from
    // re-fetching from TMDB whenever HomePage re-renders for unrelated reasons (theme,
    // drawer, search dialog state, etc).
    const fetchHero = useCallback(() => Promise.all([tmdb.movie_lists.now_playing(), tmdb.tv_lists.popular()]), [tmdb])
    const fetchPopularMovies = useCallback(() => tmdb.movie_lists.popular({}), [tmdb])
    const fetchTrendingTv = useCallback(() => tmdb.tv_lists.popular({}), [tmdb])
    const fetchTopRatedMovies = useCallback(() => tmdb.movie_lists.top_rated(), [tmdb])

    return (
        <div className="min-h-screen overflow-hidden">
            <HeroCarousel tmdb={tmdb} fetcher={fetchHero} />

            <HeroFade />

            <section className="flex flex-col gap-8 bg-background p-8">
                <MovieRail title="Popular Movies" fetcher={fetchPopularMovies} />

                <TvRail title="Trending TV Shows" fetcher={fetchTrendingTv} />

                <MovieRail title="Top Rated Movies" fetcher={fetchTopRatedMovies} />
            </section>
        </div>
    )
}

export default HomePage
