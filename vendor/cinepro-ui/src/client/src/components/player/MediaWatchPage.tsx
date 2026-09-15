import { screeningRoom, isScreeningServer } from "@/lib/screening-room"
import { StreamAvailability } from "./StreamPreparation"
import { useState } from "react"
import { useMediaWatchContext } from "./providers/MediaWatchProvider"
import { useParams, useSearchParams, useNavigate } from "react-router-dom"
import { MediaWatchProvider } from "./providers/MediaWatchProvider"
import { useMediaWatch } from "./hooks/useMediaWatch"
import { MediaPlayer } from "./MediaPlayer"
import { ErrorState } from "./ErrorState"
import type { MediaType } from "./types/media.types"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { useOmss } from "@/hooks/use-omss.ts"

function MediaWatchPageContent({ type, retry }: { type: MediaType; retry: () => void }) {
    const { id } = useParams<{ id: string }>()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()

    const { valid } = useOmss()

    const season = searchParams.get("s") ? parseInt(searchParams.get("s")!) : type === "tv" ? 1 : undefined

    const episode = searchParams.get("e") ? parseInt(searchParams.get("e")!) : type === "tv" ? 1 : undefined

    const media = useMediaWatch(valid ? id! : "", type, valid ? season : undefined, valid ? episode : undefined)

    const { state, selectSource, setError } = useMediaWatchContext()
    const error = media.error || state.error

    if (!valid) {
        return (
            <div className="relative min-h-screen bg-black text-foreground">
                <div className="flex min-h-screen w-full items-center justify-center gap-4">
                    <div className="space-y-4 text-center">
                        <p>Your OMSS server is unreachable. Please set it up correctly.</p>
                        <Button onClick={() => navigate("/settings?tab=omss")}>Go to Settings</Button>
                    </div>
                </div>

                <div className="absolute top-4 left-4 z-50">
                    <Button variant="ghost" className="border border-border" onClick={() => navigate(-1)}>
                        <ChevronLeft className="h-6 w-6" /> Back
                    </Button>
                </div>
            </div>
        )
    }

    if (error) {
        const alternatives = state.media?.playback.sources.filter(source => source.url !== state.media?.playback.selectedSource?.url) || []
        return <div className="min-h-screen bg-black text-white"><Button className="m-4" variant="outline" onClick={() => navigate(-1)}>Back</Button>
            <ErrorState error={error} onRetry={retry} />
            {alternatives.length > 0 && <div className="mx-auto flex max-w-xl flex-wrap gap-3 p-6">{alternatives.map(source => <Button key={source.url} variant="outline" onClick={() => { selectSource(source); setError(undefined) }}>Try {source.provider.name}</Button>)}</div>}
        </div>
    }

    const remotePlayer = screeningRoom && state.media?.playback.selectedSource?.type === "embed" && isScreeningServer(state.media.playback.selectedSource.url)
    return (
        <div className="relative min-h-screen bg-black text-foreground">
            {!remotePlayer && <div className="absolute top-4 left-4 z-50">
                <Button variant="ghost" className="border border-border" onClick={() => navigate(-1)}>
                    <ChevronLeft className="h-6 w-6" /> Back
                </Button>
            </div>}

            <div className="h-full w-full bg-black">
                {screeningRoom && media.isLoading && <StreamAvailability target={{ id: id!, type, seasonNumber: season, episodeNumber: episode }} />}
                <MediaPlayer />
            </div>
        </div>
    )
}

export default function MediaWatchPage({ type }: { type: MediaType }) {
    const [attempt, setAttempt] = useState(0)
    const { id } = useParams()
    const [query] = useSearchParams()
    const entry = `${type}:${id}:${type === "tv" ? query.get("s") || 1 : ""}:${type === "tv" ? query.get("e") || 1 : ""}:${attempt}`
    return (
        <div data-player-fullscreen-root><MediaWatchProvider key={entry}>
            <MediaWatchPageContent type={type} retry={() => setAttempt(value => value + 1)} />
        </MediaWatchProvider></div>
    )
}
