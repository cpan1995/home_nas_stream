import { useEffect, useRef, useState } from "react"
import Hls from "hls.js"

// A same-origin player for Miruro's direct streams. Uses the same narrow message
// protocol as the embedded providers so TV controls and quality checks work.
export function AnimeStreamPlayer() {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [error, setError] = useState("")
    const [revision, retry] = useState(0)
    useEffect(() => {
        const video = videoRef.current!
        const match = /^\/anime-player\/([1-9]\d*)\/([1-9]\d*)\/(sub|dub)$/.exec(location.pathname)
        if (!match) { setError("Invalid anime episode."); return }
        const abort = new AbortController()
        let hls: Hls | undefined, session = "", failure = "", disposed = false
        let probing = window.name === "screening-room-quality-probe"
        let sources: { url: string; type: string }[] = [], sourceIndex = 0, wantPlay = probing
        const send = (data: object) => { if (window.parent !== window) window.parent.postMessage(data, location.origin) }
        const fail = (message: string) => { failure = message; setError(message); status() }
        const status = () => send({ source: "screening-room-player", event: failure || video.error ? "error" : video.ended ? "ended" : "playerstatus",
            currentTime: video.currentTime || 0, duration: Number.isFinite(video.duration) ? video.duration : 0,
            paused: video.paused, ready: video.readyState > 0 })
        const tracks = () => send({ source: "screening-room-tracks", ready: video.readyState > 0, error: failure,
            subtitles: Array.from(video.textTracks).filter(t => ["subtitles", "captions"].includes(t.kind)).map((t, i) => ({ id: `sub:${i}`, label: t.label || t.language || `Subtitle ${i + 1}`, selected: t.mode === "showing" })),
            audio: (hls?.audioTracks || []).map((t, i) => ({ id: `audio:${i}`, label: t.name || t.lang || `Audio ${i + 1}`, selected: hls?.audioTrack === i })) })
        const measure = () => {
            if (!session) return
            const width = video.videoWidth, height = video.videoHeight
            const quality = video.getVideoPlaybackQuality?.()
            send({ source: "screening-room-quality", session, width, height,
                resolution: width && height ? [2160, 1440, 1080, 720, 480, 360, 240, 144].find(h => height >= h * .95 || width >= Math.round(h * 16 / 9) * .98) || height : 0,
                time: video.currentTime || 0, frames: quality ? quality.totalVideoFrames - quality.droppedVideoFrames : 0,
                ready: video.readyState, paused: video.paused, error: failure || (video.error ? "decode-failed" : undefined),
                options: [...new Set((hls?.levels || []).map(l => l.height).filter(h => h >= 144))].map(height => ({ id: `q:${height}`, height })) })
        }
        const play = () => video.play().catch(e => { if (!disposed && e.name !== "AbortError" && e.name !== "NotAllowedError") fail("The video could not start. Try another anime server.") })
        const load = () => {
            hls?.destroy(); hls = undefined
            const source = sources[sourceIndex]
            if (!source) { fail("No playable stream was returned. Try another anime server."); return }
            if (source.type === "hls" || source.type === "m3u8" || /\.m3u8(?:[?#]|$)/.test(source.url)) {
                if (Hls.isSupported()) {
                    hls = new Hls()
                    hls.loadSource(source.url); hls.attachMedia(video)
                    hls.on(Hls.Events.MANIFEST_PARSED, () => { if (wantPlay) void play() })
                    hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal && !disposed) { sourceIndex++; load() } })
                } else if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = source.url
                else fail("This device cannot play this stream. Try another anime server.")
            } else video.src = source.url
        }
        const message = (event: MessageEvent) => {
            if (event.source !== window.parent || event.origin !== location.origin) return
            const data = event.data
            if (data?.source === "screening-room-control") {
                if (data.action === "play") { wantPlay = true; void play() }
                else if (data.action === "pause") { wantPlay = false; video.pause() }
                else if (data.action === "seek" && Number.isFinite(data.time)) video.currentTime = Math.max(0, Math.min(video.duration || data.time, data.time))
                else if (data.action === "setVolume" && Number.isFinite(data.volume)) { video.volume = Math.max(0, Math.min(1, data.volume)); video.muted = video.volume === 0 }
                status()
            } else if (data?.source === "screening-room-track-control") {
                if (data.action === "selectTrack" && typeof data.id === "string") {
                    const subs = Array.from(video.textTracks).filter(t => ["subtitles", "captions"].includes(t.kind))
                    if (data.id === "sub:off" || /^sub:\d+$/.test(data.id)) subs.forEach((t, i) => { t.mode = data.id === `sub:${i}` ? "showing" : "disabled" })
                    else if (/^audio:\d+$/.test(data.id) && hls) { const index = Number(data.id.slice(6)); if (index < hls.audioTracks.length) hls.audioTrack = index }
                }
                tracks()
            } else if (data?.source === "screening-room-quality-control" && typeof data.session === "string" && data.session.length <= 120) {
                session = data.session
                if (data.action === "probe") { probing = true; wantPlay = true; video.muted = true; video.volume = 0; void play() }
                if (data.action === "stop" && probing) { wantPlay = false; video.pause() }
                if (["probe", "select"].includes(data.action) && /^q:\d+$/.test(data.id) && hls) {
                    const index = hls.levels.findIndex(l => l.height === Number(data.id.slice(2)))
                    if (index >= 0 && hls.currentLevel !== index) hls.currentLevel = index
                }
                measure()
            }
        }
        const loaded = () => { status(); if (wantPlay) void play() }
        const mediaError = () => { if (!hls && sources.length && !disposed) { sourceIndex++; load() } }
        video.addEventListener("loadedmetadata", loaded)
        video.addEventListener("error", mediaError)
        window.addEventListener("message", message)
        const timer = setInterval(() => { status(); measure() }, 500)
        setError("")
        video.muted = probing
        void fetch(`/api/anime/miruro/${match[1]}/${match[2]}/${match[3]}`, { signal: abort.signal })
            .then(async response => {
                const data = await response.json()
                if (!response.ok) throw Error(data.error || "Miruro is unavailable. Try another anime server.")
                if (disposed) return
                sources = data.sources
                for (const [index, sub] of data.subtitles.entries()) {
                    const track = document.createElement("track")
                    track.kind = "subtitles"; track.label = sub.label; track.srclang = sub.language || "und"; track.src = sub.url; track.default = index === 0
                    video.appendChild(track)
                }
                load()
            }).catch(e => { if (!disposed) fail(e.message) })
        return () => { disposed = true; abort.abort(); clearInterval(timer); window.removeEventListener("message", message); video.removeEventListener("loadedmetadata", loaded); video.removeEventListener("error", mediaError); hls?.destroy(); video.pause(); video.removeAttribute("src"); video.replaceChildren(); video.load() }
    }, [revision])
    return <div style={{ position: "fixed", inset: 0, background: "#000", color: "white" }}>
        <video ref={videoRef} playsInline style={{ width: "100%", height: "100%" }} />
        {error && <div role="alert" style={{ position: "absolute", inset: "25% 10%", textAlign: "center", fontSize: 22 }}>
            <p>{error}</p><button onClick={() => retry(n => n + 1)}>Retry Miruro</button>
        </div>}
    </div>
}
