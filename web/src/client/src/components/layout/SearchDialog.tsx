import { useEffect, useState } from "react"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Skeleton } from "@/components/ui/skeleton"
import { useTmdb } from "@/hooks/use-tmdb"
import { useDebouncedValue } from "@/hooks/use-debounce"
import type { MultiSearchResultItem } from "@lorenzopant/tmdb"
import { useSearchParams } from "react-router-dom"
import { LucideClapperboard, LucideFilter, LucidePlay, LucideTv } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useAppSettings } from "@/hooks/use-appsettings.ts"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx"
import { useMediaDrawer } from "@/components/media/drawer/hooks/useMediaDrawer.ts"
import { StarRating } from "@/components/media/StarRating"

type MediaFilter = "all" | "movie" | "tv"

export function SearchDialog() {
    const tmdb = useTmdb()
    const { showSearch, setShowSearch } = useAppSettings()
    const { t } = useTranslation(["searchdialog", "common"])
    const { open } = useMediaDrawer()

    const [query, setQuery] = useState("")
    const debouncedQuery = useDebouncedValue(query, 400)

    const [results, setResults] = useState<MultiSearchResultItem[]>([])
    const [loading, setLoading] = useState(false)
    const [searchError, setSearchError] = useState(false)
    const [attempt, setAttempt] = useState(0)
    const [searchParams, setSearchParams] = useSearchParams()

    const [filter, setFilter] = useState<MediaFilter>("all")

    // read params
    useEffect(() => {
        const q = searchParams.get("q")
        const f = searchParams.get("type") as MediaFilter | null

        if (q) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setQuery(q)
            setShowSearch(true)
        }

        if (f === "movie" || f === "tv" || f === "all") {
            setFilter(f)
        }
    }, [searchParams, setShowSearch])

    // keyboard shortcut
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const nav = navigator as Navigator & { userAgentData?: { platform: string } }

            const platform = nav.userAgentData?.platform ?? navigator.userAgent ?? ""
            const isMac = platform.toLowerCase().includes("mac")

            const modKey = isMac ? e.metaKey : e.ctrlKey

            if (modKey && e.key.toLowerCase() === "f") {
                e.preventDefault()
                setShowSearch(!showSearch)
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [showSearch, setShowSearch])

    // sync URL params
    useEffect(() => {
        if (!showSearch) return

        const params = new URLSearchParams(searchParams)

        if (query) {
            params.set("q", query)
        } else {
            params.delete("q")
        }

        if (filter !== "all") {
            params.set("type", filter)
        } else {
            params.delete("type")
        }

        setSearchParams(params, { replace: true })
    }, [query, filter, showSearch, setSearchParams, searchParams])

    // debounced search
    useEffect(() => {
        if (!debouncedQuery) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setResults([])
            setLoading(false)
            setSearchError(false)
            return
        }

        let cancelled = false

        const fetchResults = async () => {
            setLoading(true)
            setSearchError(false)

            try {
                const res = await tmdb.search.multi({
                    query: debouncedQuery,
                })

                if (!cancelled) {
                    setResults(res.results.filter((item) => item.media_type !== "person") ?? [])
                }
            } catch (err) {
                console.error(err)
                if (!cancelled) { setResults([]); setSearchError(true) }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        fetchResults()

        return () => {
            cancelled = true
        }
    }, [debouncedQuery, tmdb, attempt])

    const handleSelect = (item: MultiSearchResultItem) => {
        open({
            type: item.media_type === "movie" ? "movie" : "tv",
            id: item.id,
        })
    }

    // filtering
    const filteredResults = results.filter((r) => {
        if (filter === "all") return true
        return r.media_type === filter
    })

    const renderItem = (item: MultiSearchResultItem) => {
        let title = ""
        let subtitle = ""
        let image: string | undefined = ""
        let rating: number | null = null
        let icon = null

        if (item.media_type === "movie") {
            title = item.title
            subtitle = item.release_date || t("fallbackDate")
            image = item.poster_path
            rating = item.vote_average
            icon = <LucidePlay className="h-4 w-4" />
        }

        if (item.media_type === "tv") {
            title = item.name
            subtitle = item.first_air_date || t("fallbackDate")
            image = item.poster_path
            rating = item.vote_average
            icon = <LucideTv className="h-4 w-4" />
        }

        return (
            <CommandItem key={`${item.media_type}-${item.id}`} value={`${title}-${item.media_type}-${item.id}`} onSelect={() => handleSelect(item)} className="flex items-center gap-3">
                {image ? (
                    <img src={image} alt={title} className="h-14 w-10 shrink-0 rounded-md object-cover" />
                ) : (
                    <div className="flex h-14 w-10 items-center justify-center rounded-md bg-muted">{icon}</div>
                )}

                <div className="flex flex-col overflow-hidden">
                    <span className="truncate text-sm font-medium">{title}</span>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground ring-0 outline-none focus:ring-0 focus:outline-none">
                        {rating !== null && <StarRating rating={rating} />}

                        <span>{subtitle}</span>
                    </div>
                </div>
            </CommandItem>
        )
    }

    return (
        <CommandDialog
            open={showSearch}
            onOpenChange={(o) => {
                setShowSearch(o)

                if (!o) {
                    setSearchParams({}, { replace: true })
                }
            }}
            className="lenis-stopped lenis-disabled max-h-[80vh] w-[95vw] max-w-180 transition-transform sm:w-150 sm:scale-[1.05] md:w-180 md:scale-[1.20]"
        >
            <Command>
                <div className="px-2 pt-2">
                    <InputGroup>
                        <InputGroupInput placeholder={t("placeholder")} value={query} onChange={(e) => setQuery(e.target.value)} />

                        <InputGroupAddon align="inline-end">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="flex items-center gap-1 pr-1">
                                        <LucideFilter className={`h-4 w-4 ${filter !== "all" ? "text-primary" : "text-muted-foreground"}`} />
                                    </button>
                                </DropdownMenuTrigger>

                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setFilter("all")}>
                                        <LucidePlay className="mr-2 h-4 w-4" />
                                        {t("common:all")}
                                    </DropdownMenuItem>

                                    <DropdownMenuItem onClick={() => setFilter("movie")} className={filter === "movie" ? "text-primary" : ""}>
                                        <LucideClapperboard className="mr-2 h-4 w-4" />
                                        {t("common:movie.plural")}
                                    </DropdownMenuItem>

                                    <DropdownMenuItem onClick={() => setFilter("tv")} className={filter === "tv" ? "text-primary" : ""}>
                                        <LucideTv className="mr-2 h-4 w-4" />
                                        {t("common:tvShow.plural")}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </InputGroupAddon>
                    </InputGroup>
                </div>

                <CommandList>
                    {loading && (
                        <div className="space-y-2 p-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))}
                        </div>
                    )}

                    {!loading && query.length === 0 && <CommandEmpty>{t("emptyIdle")}</CommandEmpty>}

                    {!loading && searchError && <CommandEmpty>Search is unavailable. <button className="underline" onClick={() => setAttempt(value => value + 1)}>Retry search</button></CommandEmpty>}

                    {!loading && !searchError && query.length > 0 && results.length === 0 && (
                        <CommandEmpty>
                            {t("emptyNoResults")} <span className="text-muted-foreground italic">{t("quoteAuthor")}</span>
                        </CommandEmpty>
                    )}

                    {!loading && filteredResults.length > 0 && (
                        <CommandGroup heading={filter === "movie" ? t("common:movie.plural") : filter === "tv" ? t("common:tvShow.plural") : t("common:results")}>
                            {filteredResults.map(renderItem)}
                        </CommandGroup>
                    )}
                </CommandList>
            </Command>
        </CommandDialog>
    )
}
