import React, { useMemo, useState } from "react"
import { LayoutGrid, List as ListIcon } from "lucide-react"

import { useSeasonDetails } from "./hooks/useSeasonDetails"
import type { MediaSeason } from "./types/media.types"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
import { Button } from "@/components/ui/button"
import { useMediaDrawer } from "@/components/media/drawer/hooks/useMediaDrawer.ts"
import { useNavigate } from "react-router-dom"

interface MediaEpisodesProps {
    tvId: number
    seasons: MediaSeason[]
}

export const MediaEpisodes: React.FC<MediaEpisodesProps> = ({ tvId, seasons }) => {
    const [selectedSeason, setSelectedSeason] = useState(seasons[0]?.seasonNumber ?? 1)
    const { closeAll } = useMediaDrawer()
    const navigate = useNavigate()

    const [view, setView] = useState<"carousel" | "list">("carousel")

    const [order, setOrder] = useState<"first" | "latest">("first")

    const orderedSeasons = useMemo(() => {
        const filtered = seasons.filter((s) => s.episodeCount > 0)

        return order === "first" ? filtered : [...filtered].reverse()
    }, [seasons, order])

    const { episodes, isLoading } = useSeasonDetails(tvId, selectedSeason)

    const orderedEpisodes = useMemo(() => {
        if (!episodes) return []

        return order === "first" ? episodes : [...episodes].reverse()
    }, [episodes, order])

    if (!seasons.length) return null

    const handleEpisodeSelect = (episode: (typeof episodes)[number]) => {
        closeAll()

        requestAnimationFrame(() => {
            navigate(`/watch/tv/${tvId}/?s=${selectedSeason}&e=${episode.episodeNumber}`, { state: { startPlayback: true } })
        })
    }

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h3 className="text-xl font-semibold">Episodes</h3>

                    <Select value={selectedSeason.toString()} onValueChange={(val) => setSelectedSeason(parseInt(val))}>
                        <SelectTrigger className="w-35" aria-label="Season">
                            <SelectValue placeholder="Select season" />
                        </SelectTrigger>

                        <SelectContent>
                            {orderedSeasons.map((s) => (
                                <SelectItem key={s.id} value={s.seasonNumber.toString()}>
                                    {s.name || `Season ${s.seasonNumber}`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant={"outline"}
                        className={"rounded-full"}
                        onClick={() => {
                            const nextOrder = order === "first" ? "latest" : "first"

                            setOrder(nextOrder)

                            const filtered = seasons.filter((s) => s.episodeCount > 0)

                            const nextSeasons = nextOrder === "first" ? filtered : [...filtered].reverse()

                            if (nextSeasons.length > 0) {
                                setSelectedSeason(nextSeasons[0].seasonNumber)
                            }
                        }}
                    >
                        {order === "first" ? "Oldest First" : "Newest First"}
                    </Button>

                    <Tabs className="pl-2" value={view} onValueChange={(val) => setView(val as "carousel" | "list")}>
                        <TabsList className="grid w-25 grid-cols-2">
                            <TabsTrigger value="carousel" aria-label="Episode carousel">
                                <LayoutGrid className="h-4 w-4" />
                            </TabsTrigger>

                            <TabsTrigger value="list" aria-label="Episode list">
                                <ListIcon className="h-4 w-4" />
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            {isLoading ? (
                <div className="flex h-40 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
            ) : view === "carousel" ? (
                <Carousel
                   
                    className="w-full"
                    opts={{
                        align: "start",
                        dragFree: true,
                    }}
                >
                    <CarouselContent className="-ml-4">
                        {orderedEpisodes.map((episode) => (
                            <CarouselItem
                                role="button" tabIndex={0} aria-label={`Play episode ${episode.episodeNumber}: ${episode.name}`}
                               
                                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!event.repeat) handleEpisodeSelect(episode) } }}
                                key={episode.id}
                                className="basis-full pl-4 transition-transform duration-300 ease-in-out hover:scale-[1.02] hover:cursor-pointer md:basis-1/3 lg:basis-1/4"
                                onClick={() => handleEpisodeSelect(episode)}
                            >
                                <div className="space-y-2">
                                    <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
                                        {episode.stillUrl ? (
                                            <img src={episode.stillUrl} alt={episode.name} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">No Preview</div>
                                        )}

                                        <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white backdrop-blur-sm">Ep {episode.episodeNumber}</div>
                                    </div>

                                    <div className="space-y-1">
                                        <p className="leading-none font-medium">{episode.name}</p>

                                        <p className="line-clamp-2 text-xs text-muted-foreground">{episode.overview || "No overview available."}</p>
                                    </div>
                                </div>
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                    <CarouselPrevious className="hidden md:flex" />
                    <CarouselNext className="hidden md:flex" />
                </Carousel>
            ) : (
                <div className="h-100 overflow-x-scroll pr-4">
                    <div className="space-y-4">
                        {orderedEpisodes.map((episode) => (
                            <div key={episode.id} role="button" tabIndex={0} aria-label={`Play episode ${episode.episodeNumber}: ${episode.name}`}
                                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!event.repeat) handleEpisodeSelect(episode) } }}
                                className="flex gap-4 border-b border-border pb-4 last:border-0" onClick={() => handleEpisodeSelect(episode)}>
                                <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded bg-muted">
                                    {episode.stillUrl ? (
                                        <img src={episode.stillUrl} alt={episode.name} className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">No Preview</div>
                                    )}
                                </div>

                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-medium">
                                            {episode.episodeNumber}. {episode.name}
                                        </p>

                                        {episode.runtime && <p className="text-xs text-muted-foreground">{episode.runtime}m</p>}
                                    </div>

                                    <p className="line-clamp-2 text-xs text-muted-foreground">{episode.overview || "No overview available."}</p>

                                    <p className="text-[10px] text-muted-foreground">{episode.airDate}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    )
}
