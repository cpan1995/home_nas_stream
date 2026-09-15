import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ChevronDownIcon, ShuffleIcon } from "lucide-react"
import type {
    CountryISO3166_1,
    DiscoverMovieParams,
    DiscoverMovieSortBy,
    DiscoverTVParams,
    DiscoverTVSortBy,
    Genre,
    MovieResultItem,
    DiscoverTVResultItem,
    WatchProviderListItem,
} from "@lorenzopant/tmdb"
import { useTmdb } from "@/hooks/use-tmdb"
import { useAppSettings } from "@/hooks/use-appsettings.ts"
import { useMediaDrawer } from "@/components/media/drawer/hooks/useMediaDrawer"
import { MediaCard } from "@/components/media/MediaRail/MediaCard.tsx"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"

type MediaKind = "movie" | "tv" | "anime"
type SortKey = "popularity" | "rating" | "newest" | "oldest" | "az"
type ResultItem = (MovieResultItem | DiscoverTVResultItem) & { media_kind: "movie" | "tv" }

const MEDIA_KIND_OPTIONS: { value: MediaKind; label: string }[] = [
    { value: "movie", label: "Movies" },
    { value: "tv", label: "TV Shows" },
    { value: "anime", label: "Anime" },
]

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: "popularity", label: "Most Popular" },
    { value: "rating", label: "Top Rated" },
    { value: "newest", label: "Newest" },
    { value: "oldest", label: "Oldest" },
    { value: "az", label: "A-Z" },
]

const MOVIE_SORT_MAP: Record<SortKey, DiscoverMovieSortBy> = {
    popularity: "popularity.desc",
    rating: "vote_average.desc",
    newest: "primary_release_date.desc",
    oldest: "primary_release_date.asc",
    az: "title.asc",
}

const TV_SORT_MAP: Record<SortKey, DiscoverTVSortBy> = {
    popularity: "popularity.desc",
    rating: "vote_average.desc",
    newest: "first_air_date.desc",
    oldest: "first_air_date.asc",
    az: "name.asc",
}

// TMDB has no native "anime" media type — Animation genre + Japan origin is the standard
// approximation used across most TMDB-backed apps.
const ANIME_GENRE_ID = 16
const ANIME_ORIGIN_COUNTRY = "JP" as CountryISO3166_1

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 1950 + 1 }, (_, i) => CURRENT_YEAR - i)

export default function Discover() {
    const tmdb = useTmdb()
    const { region } = useAppSettings()
    const { open } = useMediaDrawer()

    const [mediaKind, setMediaKind] = useState<MediaKind>("movie")
    const [genreIds, setGenreIds] = useState<number[]>([])
    const [providerIds, setProviderIds] = useState<number[]>([])
    const [sortKey, setSortKey] = useState<SortKey>("popularity")
    const [fromYear, setFromYear] = useState<number | null>(null)
    const [toYear, setToYear] = useState<number | null>(null)
    const [page, setPage] = useState(1)

    const effectiveType: "movie" | "tv" = mediaKind === "movie" ? "movie" : "tv"

    const [genres, setGenres] = useState<Genre[]>([])
    const [providers, setProviders] = useState<WatchProviderListItem[]>([])

    // Genre/provider id spaces differ between movie and TV, so selections reset whenever
    // the effective TMDB type changes (Anime still maps to "tv" under the hood).
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setGenreIds([])
        setProviderIds([])
        setPage(1)
    }, [effectiveType])

    useEffect(() => {
        let mounted = true
        ;(effectiveType === "movie" ? tmdb.genres.movie_list() : tmdb.genres.tv_list())
            .then((data) => {
                if (mounted) setGenres(data.genres)
            })
            .catch((e) => console.error(e))
        return () => {
            mounted = false
        }
    }, [tmdb, effectiveType])

    useEffect(() => {
        let mounted = true
        ;(effectiveType === "movie" ? tmdb.watch_providers.movie_providers() : tmdb.watch_providers.tv_providers())
            .then((data) => {
                if (mounted) setProviders(data.results)
            })
            .catch((e) => console.error(e))
        return () => {
            mounted = false
        }
    }, [tmdb, effectiveType])

    function buildMovieParams(pageOverride?: number): DiscoverMovieParams {
        // Checking multiple genres/providers is meant to broaden results ("any of these"),
        // so both use TMDB's OR (`|`) syntax instead of the default AND (`,`).
        const genrePart = genreIds
        const watchRegion = (region ?? "US") as CountryISO3166_1

        return {
            page: pageOverride ?? page,
            sort_by: MOVIE_SORT_MAP[sortKey],
            ...(genrePart.length ? { with_genres: genrePart.join("|") } : {}),
            ...(providerIds.length ? { with_watch_providers: providerIds.join("|"), watch_region: watchRegion } : {}),
            ...(sortKey === "rating" ? { "vote_count.gte": 50 } : {}),
            ...(fromYear ? { "primary_release_date.gte": `${fromYear}-01-01` } : {}),
            ...(toYear ? { "primary_release_date.lte": `${toYear}-12-31` } : {}),
        }
    }

    function buildTvParams(pageOverride?: number): DiscoverTVParams {
        const genrePart = mediaKind === "anime" ? [...genreIds, ANIME_GENRE_ID] : genreIds
        const watchRegion = (region ?? "US") as CountryISO3166_1

        return {
            page: pageOverride ?? page,
            sort_by: TV_SORT_MAP[sortKey],
            with_genres: genrePart.join("|"),
            ...(providerIds.length ? { with_watch_providers: providerIds.join("|"), watch_region: watchRegion } : {}),
            ...(sortKey === "rating" ? { "vote_count.gte": 50 } : {}),
            ...(mediaKind === "anime" ? { with_origin_country: ANIME_ORIGIN_COUNTRY } : {}),
            ...(fromYear ? { "first_air_date.gte": `${fromYear}-01-01` } : {}),
            ...(toYear ? { "first_air_date.lte": `${toYear}-12-31` } : {}),
        }
    }

    function fetchPage(pageOverride?: number) {
        return effectiveType === "movie" ? tmdb.discover.movie(buildMovieParams(pageOverride)) : tmdb.discover.tv(buildTvParams(pageOverride))
    }

    const [results, setResults] = useState<ResultItem[]>([])
    const [totalPages, setTotalPages] = useState(1)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        let mounted = true

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsLoading(true)
        fetchPage()
            .then((data) => {
                if (!mounted) return
                setResults(data.results.map((item) => ({ ...item, media_kind: effectiveType }) as ResultItem))
                setTotalPages(Math.max(1, Math.min(data.total_pages, 500)))
            })
            .catch((e) => {
                console.error(e)
                if (mounted) {
                    setResults([])
                    setTotalPages(1)
                }
            })
            .finally(() => {
                if (mounted) setIsLoading(false)
            })

        return () => {
            mounted = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tmdb, effectiveType, mediaKind, sortKey, region, fromYear, toYear, page, genreIds.join(","), providerIds.join(",")])

    const [isSurprising, setIsSurprising] = useState(false)

    async function surpriseMe() {
        setIsSurprising(true)
        try {
            const first = await fetchPage(1)
            const cappedPages = Math.max(1, Math.min(first.total_pages, 500))
            const randomPage = cappedPages > 1 ? Math.floor(Math.random() * cappedPages) + 1 : 1
            const pageResult = randomPage === 1 ? first : await fetchPage(randomPage)

            if (!pageResult.results.length) {
                toast.error("No matches for these filters.")
                return
            }

            const pick = pageResult.results[Math.floor(Math.random() * pageResult.results.length)]
            open({ type: effectiveType, id: pick.id })
        } catch (e) {
            console.error(e)
            toast.error("Couldn't find a surprise right now.")
        } finally {
            setIsSurprising(false)
        }
    }

    function toggleGenre(id: number) {
        setGenreIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]))
        setPage(1)
    }

    function toggleProvider(id: number) {
        setProviderIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
        setPage(1)
    }

    const selectedMediaKindOption = MEDIA_KIND_OPTIONS.find((o) => o.value === mediaKind) ?? MEDIA_KIND_OPTIONS[0]
    const sortLabel = SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? "Most Popular"

    return (
        <div className="mx-auto w-full max-w-7xl space-y-6 p-8">
            <h1 className="text-2xl font-semibold">Discover</h1>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                {genreIds.length ? `Genres (${genreIds.length})` : "All Genres"}
                                <ChevronDownIcon className="size-4 opacity-60" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-h-72 overflow-y-auto">
                            {genres.map((genre) => (
                                <DropdownMenuCheckboxItem key={genre.id} checked={genreIds.includes(genre.id)} onCheckedChange={() => toggleGenre(genre.id)} onSelect={(e) => e.preventDefault()}>
                                    {genre.name}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                {providerIds.length ? `Providers (${providerIds.length})` : "All Providers"}
                                <ChevronDownIcon className="size-4 opacity-60" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-h-72 overflow-y-auto">
                            {providers.map((provider) => (
                                <DropdownMenuCheckboxItem
                                    key={provider.provider_id}
                                    checked={providerIds.includes(provider.provider_id)}
                                    onCheckedChange={() => toggleProvider(provider.provider_id)}
                                    onSelect={(e) => e.preventDefault()}
                                >
                                    {provider.provider_name}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                {sortLabel}
                                <ChevronDownIcon className="size-4 opacity-60" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuRadioGroup
                                value={sortKey}
                                onValueChange={(value) => {
                                    setSortKey(value as SortKey)
                                    setPage(1)
                                }}
                            >
                                {SORT_OPTIONS.map((option) => (
                                    <DropdownMenuRadioItem key={option.value} value={option.value}>
                                        {option.label}
                                    </DropdownMenuRadioItem>
                                ))}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                {fromYear ?? "From Year"}
                                <ChevronDownIcon className="size-4 opacity-60" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-h-72 overflow-y-auto">
                            <DropdownMenuRadioGroup
                                value={fromYear ? String(fromYear) : "any"}
                                onValueChange={(value) => {
                                    setFromYear(value === "any" ? null : Number(value))
                                    setPage(1)
                                }}
                            >
                                <DropdownMenuRadioItem value="any">Any</DropdownMenuRadioItem>
                                {YEARS.map((year) => (
                                    <DropdownMenuRadioItem key={year} value={String(year)}>
                                        {year}
                                    </DropdownMenuRadioItem>
                                ))}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                {toYear ?? "To Year"}
                                <ChevronDownIcon className="size-4 opacity-60" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-h-72 overflow-y-auto">
                            <DropdownMenuRadioGroup
                                value={toYear ? String(toYear) : "any"}
                                onValueChange={(value) => {
                                    setToYear(value === "any" ? null : Number(value))
                                    setPage(1)
                                }}
                            >
                                <DropdownMenuRadioItem value="any">Any</DropdownMenuRadioItem>
                                {YEARS.map((year) => (
                                    <DropdownMenuRadioItem key={year} value={String(year)}>
                                        {year}
                                    </DropdownMenuRadioItem>
                                ))}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="flex items-center gap-2">
                    <Combobox
                        items={MEDIA_KIND_OPTIONS}
                        value={selectedMediaKindOption}
                        onValueChange={(value) => {
                            if (!value) return
                            setMediaKind(value.value)
                            setPage(1)
                        }}
                    >
                        <ComboboxInput placeholder="Movies" className="w-40" />
                        <ComboboxContent>
                            <ComboboxEmpty>No matches</ComboboxEmpty>
                            <ComboboxList>
                                {(item: (typeof MEDIA_KIND_OPTIONS)[number]) => (
                                    <ComboboxItem key={item.value} value={item}>
                                        {item.label}
                                    </ComboboxItem>
                                )}
                            </ComboboxList>
                        </ComboboxContent>
                    </Combobox>

                    <Button onClick={surpriseMe} disabled={isSurprising}>
                        <ShuffleIcon className="size-4" />
                        Surprise me
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
                    {Array.from({ length: 21 }).map((_, i) => (
                        <Skeleton key={i} className="aspect-2/3 w-full" />
                    ))}
                </div>
            ) : results.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>No results</EmptyTitle>
                        <EmptyDescription>Try widening your filters.</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
                        {results.map((item) => {
                            const isMovie = item.media_kind === "movie"
                            const title = isMovie ? (item as MovieResultItem).title : (item as DiscoverTVResultItem).name
                            const date = isMovie ? (item as MovieResultItem).release_date : (item as DiscoverTVResultItem).first_air_date

                            return (
                                <MediaCard
                                    key={item.id}
                                    title={title}
                                    imagePath={item.poster_path}
                                    imageAlt={title}
                                    id={item.id}
                                    type={item.media_kind}
                                    year={date ? new Date(date).getFullYear() : 0}
                                    rating={item.vote_average}
                                />
                            )
                        })}
                    </div>

                    <div className="flex items-center justify-center gap-4 pt-4">
                        <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                            Previous
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            Page {page} of {totalPages}
                        </span>
                        <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                            Next
                        </Button>
                    </div>
                </>
            )}
        </div>
    )
}
