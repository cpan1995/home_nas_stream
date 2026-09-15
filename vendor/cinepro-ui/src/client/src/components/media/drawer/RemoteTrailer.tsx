import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

type TrailerPlayer = { playVideo(): void; pauseVideo(): void; seekTo(time: number, allowSeekAhead: boolean): void; getCurrentTime(): number; destroy(): void }
type YouTubeApi = { Player: new (element: HTMLElement, options: object) => TrailerPlayer }
let apiPromise: Promise<YouTubeApi> | undefined
function youtubeApi() {
    const host = window as Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void }
    if (host.YT?.Player) return Promise.resolve(host.YT)
    return apiPromise ||= new Promise((resolve, reject) => {
        const previous = host.onYouTubeIframeAPIReady
        host.onYouTubeIframeAPIReady = () => { previous?.(); if (host.YT) resolve(host.YT) }
        const script = document.createElement("script")
        script.src = "https://www.youtube.com/iframe_api"
        script.onerror = () => { apiPromise = undefined; reject(Error("Trailer controls could not load.")) }
        document.head.append(script)
    })
}

export function RemoteTrailer({ id, title }: { id: string; title: string }) {
    const container = useRef<HTMLDivElement>(null)
    const player = useRef<TrailerPlayer | null>(null)
    const [ready, setReady] = useState(false)
    const [error, setError] = useState("")
    useEffect(() => {
        let disposed = false
        const timeout = setTimeout(() => setError("Trailer is unavailable. Press Back to return."), 15000)
        youtubeApi().then(api => {
            if (disposed || !container.current) return
            const element = document.createElement("div")
            container.current.append(element)
            player.current = new api.Player(element, {
                host: "https://www.youtube-nocookie.com", videoId: id,
                playerVars: { origin: location.origin, autoplay: 1, controls: 0, disablekb: 1, playsinline: 1 },
                events: {
                    onReady: () => {
                        clearTimeout(timeout); if (disposed) return
                        setReady(true); setError("")
                        const iframe = container.current?.querySelector("iframe")
                        if (iframe) { iframe.tabIndex = -1; iframe.title = `${title} Trailer`; iframe.style.pointerEvents = "none" }
                    },
                    onError: () => { clearTimeout(timeout); if (!disposed) setError("Trailer is unavailable. Press Back to return.") },
                },
            })
        }).catch(() => { if (!disposed) setError("Trailer controls could not load. Press Back to return.") })
        return () => { disposed = true; clearTimeout(timeout); player.current?.destroy(); player.current = null }
    }, [id, title])
    return <div>
        <div ref={container} className="aspect-video [&_iframe]:h-full [&_iframe]:w-full" />
        <div className="remote-player-controls">
            <Button disabled={!ready} onClick={() => player.current?.seekTo(Math.max(0, (player.current?.getCurrentTime() || 0) - 10), true)}>−10 sec</Button>
            <Button disabled={!ready} onClick={() => player.current?.playVideo()}>Play trailer</Button>
            <Button disabled={!ready} onClick={() => player.current?.pauseVideo()}>Pause trailer</Button>
            <Button disabled={!ready} onClick={() => player.current?.seekTo((player.current?.getCurrentTime() || 0) + 10, true)}>+10 sec</Button>
        </div>
        {error && <p role="status" className="p-4 text-center">{error}</p>}
    </div>
}
