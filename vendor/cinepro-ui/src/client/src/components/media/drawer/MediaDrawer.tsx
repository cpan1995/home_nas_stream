import { StreamAvailability } from "@/components/player/StreamPreparation"
import { ArrowLeft, Calendar, Play } from "lucide-react"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useMediaDetails } from "./hooks/useMediaDetails"
import { MediaCast } from "./MediaCast"
import { MediaEpisodes } from "./MediaEpisodes"
import { MediaRecommendations } from "./MediaRecommendations"
import { TrailerDialog } from "./TrailerDialog"
import type { MediaDrawerPayload } from "./types/drawer.types"
import { formatRuntime } from "@/components/media/drawer/mappers/media.mapper.ts"
import { cn } from "@/lib/utils.ts"
import { StarRating } from "@/components/media/StarRating"
import { useNavigate } from "react-router-dom"
import { useMediaDrawer } from "@/components/media/drawer/hooks/useMediaDrawer.ts"

interface MediaDrawerProps {
    payload: MediaDrawerPayload
    canGoBack: boolean
    isOpen: boolean
    className?: string
}

export function MediaDrawer({ payload, canGoBack, isOpen, className }: MediaDrawerProps) {
    const { data, isLoading } = useMediaDetails(payload.type, payload.id)
    const { closeAll, close } = useMediaDrawer()

    const navigate = useNavigate()

    const handlePlay = () => {
        if (!data) return

        const path = payload.type === "movie" ? `/watch/movie/${data.id}` : `/watch/tv/${data.id}`

        closeAll()

        requestAnimationFrame(() => {
            navigate(path, { state: { startPlayback: true } })
        })
    }

    return (
        <Drawer open={isOpen} onOpenChange={(open) => !open && closeAll()}>
            <DrawerContent
                onEscapeKeyDown={event => { event.preventDefault(); close() }}
                className={cn("tv-details lenis-stopped lenis-disabled mx-auto mt-0 h-[98vh] max-w-6xl bg-black pt-0 outline-none", className)}
                data-lenis-prevent="true"
                headerActions={
                    canGoBack && (
                        <Button variant="outline" size="icon" onClick={close}>
                            <span className="sr-only">Back</span>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    )
                }
            >
                <DrawerHeader className="sr-only">
                    <DrawerTitle>Media Drawer</DrawerTitle>
                    <DrawerDescription>Content below</DrawerDescription>
                </DrawerHeader>

                {isLoading ? (
                    <><StreamAvailability target={{ type: payload.type, id: String(payload.id), ...(payload.type === "tv" ? { seasonNumber: 1, episodeNumber: 1 } : {}) }} /><MediaDrawerSkeleton /></>
                ) : !data ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Failed to load media details.</div>
                ) : (
                    <div className="tv-details-scroll relative h-full overflow-y-auto">
                        {/* STICKY HERO */}
                        <div className="tv-details-backdrop sticky top-0 h-screen w-full">
                            {data.backdropUrl ? (
                                <img src={data.backdropUrl} alt={`${data.title} backdrop`} draggable={false} className="h-full w-full rounded-t-2xl object-cover object-top" />
                            ) : (
                                <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">No backdrop available</div>
                            )}

                            {/* MULTI-LAYER OVERLAY */}
                            <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(0,0,0,0.85)_0%,rgba(0,0,0,0.45)_35%,rgba(0,0,0,0.75)_100%)]" />
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_80%,rgba(0,0,0,0)_0%,rgba(0,0,0,0.4)_100%)]" />
                        </div>

                        {/* CONTENT */}
                        <div className="tv-details-content relative z-20 -mt-[45vh] px-4 pb-10 text-white md:px-8">
                            {/* LOGO / TITLE */}
                            <div className="mb-6 max-w-[70%] animate-in duration-700 fade-in md:max-w-[40%]">
                                {data.logoUrl ? (
                                    <img src={data.logoUrl} alt={data.title} draggable={false} className="h-auto w-full object-contain drop-shadow-2xl" />
                                ) : (
                                    <h1 className="text-2xl font-black tracking-tight text-white drop-shadow-2xl md:text-4xl lg:text-6xl">{data.title}</h1>
                                )}
                            </div>

                            {/* META */}
                            <div className="mb-5 flex animate-in flex-wrap items-center gap-3 delay-100 duration-700 fade-in">
                                <div className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/15">
                                    <StarRating rating={data.rating} className="text-sm font-semibold text-white" />
                                </div>

                                <div className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/15">
                                    <Calendar className="h-4 w-4 text-white" />
                                    <span className="text-sm font-medium text-white">{new Date(data.releaseDate).getFullYear()}</span>
                                </div>

                                {data.runtime && (
                                    <div className="rounded-full border border-white/20 bg-white/10 px-4 py-1.5 backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/15">
                                        <span className="text-sm font-medium text-white">{formatRuntime(data.runtime)}</span>
                                    </div>
                                )}

                                {data.genres.slice(0, 3).map((genre) => (
                                    <Badge
                                        key={genre}
                                        variant="outline"
                                        className="rounded-full border-white/20 bg-white/10 px-3 py-1.5 font-medium text-white backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/15"
                                    >
                                        {genre}
                                    </Badge>
                                ))}
                            </div>

                            {/* ACTIONS */}
                            <div className="mb-6 flex animate-in flex-wrap items-center gap-3 delay-200 duration-700 fade-in">
                                <Button data-remote-default className="rounded-full px-8 font-semibold shadow-lg transition-all hover:scale-105 hover:shadow-xl" onClick={handlePlay}>
                                    <Play className="mr-2 h-5 w-5 fill-white" />
                                    Play
                                </Button>

                                {data.trailer && <TrailerDialog trailerId={data.trailer} title={data.title} />}
                            </div>

                            <StreamAvailability target={{ type: payload.type, id: String(payload.id), ...(payload.type === "tv" ? { seasonNumber: 1, episodeNumber: 1 } : {}) }} />

                            {/* OVERVIEW */}
                            <div className="mb-8 max-w-2xl animate-in text-left text-sm leading-relaxed text-white/80 delay-300 duration-700 fade-in">{data.overview}</div>

                            {/* TV EPISODES */}
                            {data.type === "tv" && data.seasons && (
                                <div className="mb-8">
                                    <MediaEpisodes tvId={data.id} seasons={data.seasons} />
                                </div>
                            )}

                            {/* CAST */}
                            <div className="mb-8">
                                <MediaCast cast={data.cast} />
                            </div>

                            {/* RECOMMENDATIONS */}
                            <div>
                                <MediaRecommendations recommendations={data.recommendations} />
                            </div>
                        </div>
                    </div>
                )}
            </DrawerContent>
        </Drawer>
    )
}

function MediaDrawerSkeleton() {
    return (
        <div className="relative h-full overflow-y-auto bg-black">
            {/* STICKY HERO */}
            <div className="tv-details-backdrop sticky top-0 h-screen w-full">
                <div className="absolute inset-0 animate-pulse bg-muted" />
                <div className="absolute inset-0 bg-linear-to-t from-black via-black/40 to-transparent" />
            </div>

            {/* CONTENT */}
            <div className="tv-details-content relative z-20 -mt-[45vh] px-4 pb-10 md:px-8">
                <div className="mb-5 h-12 w-[40%] animate-pulse rounded-md bg-muted" />

                <div className="mb-5 flex flex-wrap gap-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-8 w-20 animate-pulse rounded-full bg-muted" />
                    ))}
                </div>

                <div className="mb-6 flex gap-2">
                    <div className="h-10 w-28 animate-pulse rounded-full bg-muted" />
                    <div className="h-10 w-28 animate-pulse rounded-full bg-muted" />
                    <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                </div>

                <div className="max-w-2xl space-y-2">
                    <div className="h-3 w-full animate-pulse rounded bg-muted" />
                    <div className="h-3 w-full animate-pulse rounded bg-muted" />
                    <div className="h-3 w-[80%] animate-pulse rounded bg-muted" />
                </div>
            </div>
        </div>
    )
}
