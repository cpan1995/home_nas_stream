import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ChevronLeft, Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Captions, Maximize, Minimize, Server, Check, X, Settings2, SkipForward, ListVideo } from "lucide-react"
import type { UnifiedMedia } from "./types/media.types"

import { Dialog } from "radix-ui"
import { RemoteTracksDialog } from "./RemoteTracksDialog"
import type { NormalizedSource } from "./types/source.types"
import { useStreamPreparation, streamKey } from "./StreamPreparation"
import { EpisodeDialog } from "./EpisodeDialog"
import type { Episode } from "./hooks/useEpisodeGuide"
import { screeningServerIssue, screeningManualFallback } from "@/lib/screening-room"
import { qualitySample, decodedSince, type QualitySample, type VerifiedQuality } from './QualityProbe'
import { QualityDialog, type QualityMode } from './QualityDialog'
const stamp = (time: number) => {
    const seconds = Math.max(0, Math.floor(time)), minutes = Math.floor(seconds / 60)
    return `${minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}` : minutes}:${String(seconds % 60).padStart(2, "0")}`
}
const progress = (value: number, max: number) => ({ "--progress": `${max > 0 ? Math.min(100, value / max * 100) : 0}%` }) as CSSProperties
export function RemoteEmbeddedPlayer({ url, media, onSelectSource }: { url: string; media: UnifiedMedia; onSelectSource: (source: NormalizedSource) => void }) {
    const origin = new URL(url).origin
    const provider = media.playback.selectedSource!.provider
    const nativeAdapter = provider.id !== "moviesapi"
    const preparation = useStreamPreparation()!
    const { anime, qualities } = preparation
    const location = useLocation()
    const serverSources = [...media.playback.sources, ...anime.sources]
    const [tracksOpen, setTracksOpen] = useState(false)
    const tracksButton = useRef<HTMLButtonElement>(null)
    const [serversOpen, setServersOpen] = useState(false)
    const switchedServer = useRef(false)
    const serversButton = useRef<HTMLButtonElement>(null)
    const frame = useRef<HTMLIFrameElement>(null)
    const root = useRef<HTMLElement>(null)
    const navigate = useNavigate()
    const [status, setStatus] = useState({ time: 0, duration: 0, paused: true, ready: false })
    const pending = useRef<{ action: "play" | "pause"; deadline: number } | null>(null)
    const [request, setRequest] = useState<"play" | "pause" | null>(null)
    const [error, setError] = useState("")
    const [volume, setVolume] = useState(1)
    const previousVolume = useRef(1)
    const [awake, setAwake] = useState(true)
    const [fullscreen, setFullscreen] = useState(false)
    const [qualityOpen, setQualityOpen] = useState(false)
    const qualityButton = useRef<HTMLButtonElement>(null)
    const [qualityMode, setQualityMode] = useState<QualityMode>('auto')
    const [frameRevision, setFrameRevision] = useState(0)
    const [targetQuality, setTargetQuality] = useState<VerifiedQuality | null>(null)
    const [currentQuality, setCurrentQuality] = useState(0)
    const mediaKey = streamKey(media)
    const [episodesOpen, setEpisodesOpen] = useState(false)
    const episodesButton = useRef<HTMLButtonElement>(null)
    const nextEpisode = preparation.key === mediaKey ? preparation.guide.next[0] : undefined
    useEffect(() => { preparation.setDub(provider.id.endsWith('-anime-dub')) }, [provider.id])
    const resume = useRef<{ time: number; playing: boolean; volume: number } | null>(null)
    const playIntent = useRef(location.state?.startPlayback === true)
    useEffect(() => { if (status.time > 0 && !status.paused) preparation.started(status.duration > 0 && status.duration - status.time <= 120) }, [status.time, status.paused, status.duration])
    const latest = useRef({ qualities, status, qualityMode, volume, request }); latest.current = { qualities, status, qualityMode, volume, request }
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const showControls = tracksOpen || serversOpen || qualityOpen || episodesOpen || awake || status.paused || !status.ready || request !== null || !!error
    const wake = useCallback(() => {
        setAwake(true)
        if (hideTimer.current) clearTimeout(hideTimer.current)
        hideTimer.current = setTimeout(() => setAwake(false), 4500)
    }, [])
    useEffect(() => {
        wake()
        return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
    }, [wake, status.paused, request])
    useEffect(() => {
        if (!showControls && root.current?.contains(document.activeElement)) root.current.focus({ preventScroll: true })
    }, [showControls])
    useEffect(() => {
        const changed = () => { setFullscreen(!!document.fullscreenElement?.contains(root.current)); wake() }
        changed()
        document.addEventListener("fullscreenchange", changed)
        return () => document.removeEventListener("fullscreenchange", changed)
    }, [wake])
    const send = useCallback((action: string, fields = {}) => frame.current?.contentWindow?.postMessage({ action, ...(nativeAdapter ? { source: "screening-room-control" } : {}), ...fields }, origin), [origin, nativeAdapter])
    const selectQualitySource = (option: VerifiedQuality, play = false) => {
        const now = latest.current
        resume.current = { time: resume.current?.time ?? now.status.time, playing: play || resume.current?.playing || playIntent.current || !now.status.paused || now.request === 'play', volume: resume.current?.volume ?? now.volume }
        setTargetQuality(option)
        if (option.source.url !== url) { send('pause'); onSelectSource(option.source) }
        else if (error || (!now.status.ready && targetQuality)) setFrameRevision(n => n + 1)
        setError('')
    }
    const chooseQuality = (mode: 'auto' | number) => {
        playIntent.current = true
        setQualityMode(mode)
        const best = qualities.results.filter(q => mode === 'auto' || q.height === mode).sort((a, b) => b.height - a.height || b.checkedAt - a.checkedAt)[0]
        if (best) selectQualitySource(best, true)
    }
    useEffect(() => {
        if (qualityMode === 'manual') return
        const best = qualities.results.filter(q => qualityMode === 'auto' || q.height === qualityMode)
            .sort((a, b) => b.height - a.height || Number(b.source.url === url) - Number(a.source.url === url))[0]
        const retained = targetQuality && qualities.results.some(q => q.source.url === targetQuality.source.url && q.height === targetQuality.height)
        if (best && (!targetQuality || !retained || best.height > targetQuality.height)) selectQualitySource(best)
    }, [qualities.results, qualityMode, url, targetQuality])
    useEffect(() => {
        const session = crypto.randomUUID()
        let before: QualitySample | null = null, lastAdvance = Date.now(), tried = 0, failed = false
        let lastMatch = Date.now()
        const fail = () => {
            if (failed) return
            failed = true
            const now = latest.current
            resume.current ??= { time: now.status.time, playing: playIntent.current || !now.status.paused, volume: now.volume }
            now.qualities.reject(url); send('pause'); pending.current = null; setRequest(null)
            if (now.qualityMode !== 'manual') setError(now.qualityMode === 'auto'
                ? 'This video could not play. Open Quality to see working options or check again.'
                : `${now.qualityMode}p could not play. Checking for another source at this quality. You can also choose Auto.`)
        }
        setCurrentQuality(0)
        const measure = (action: string) => frame.current?.contentWindow?.postMessage({ source: 'screening-room-quality-control', action, session, id: targetQuality?.id || 'current' }, origin)
        const message = (event: MessageEvent) => {
            if (event.origin !== origin || event.source !== frame.current?.contentWindow || event.data?.source !== 'screening-room-quality' || event.data.session !== session) return
            const sample = qualitySample(event.data)
            if (!sample || failed) return
            if (sample.width && sample.height) setCurrentQuality(sample.resolution)
            if (sample.resolution === targetQuality?.height || (sample.paused && !resume.current?.playing && !playIntent.current)) lastMatch = Date.now()
            if (decodedSince(before, sample)) {
                lastAdvance = Date.now()
                if (!targetQuality || sample.resolution === targetQuality.height) latest.current.qualities.verified({ source: media.playback.selectedSource!, id: sample.options.find(o => o.height === sample.resolution)?.id || 'current', height: sample.resolution, width: sample.width, checkedAt: Date.now() })
            }
            before = sample
            const saved = resume.current
            if (saved && sample.ready >= 1 && sample.resolution && (!targetQuality || sample.resolution === targetQuality.height)) {
                send('seek', { time: saved.time }); send('setVolume', { volume: saved.volume }); setVolume(saved.volume)
                send(saved.playing ? 'play' : 'pause')
                if (saved.playing) { pending.current = { action: 'play', deadline: Date.now() + 20000 }; setRequest('play') }
                resume.current = null; lastAdvance = Date.now()
            }
            if (sample.error || (!sample.paused && Date.now() - lastAdvance > 15000)) {
                fail()
            }
        }
        window.addEventListener('message', message)
        const timer = setInterval(() => {
            if (failed) return
            if (targetQuality && Date.now() - lastMatch > 25000) { fail(); return }
            if (targetQuality && (tried++ < 10 || before?.resolution !== targetQuality.height)) measure('select')
            if (resume.current?.playing) send('play')
            measure('measure')
        }, 1000)
        measure('measure')
        return () => { clearInterval(timer); window.removeEventListener('message', message) }
    }, [url, origin, targetQuality?.id, targetQuality?.height, send, frameRevision])
    useEffect(() => {
        pending.current = null
        setRequest(null)
        setError("")
        setVolume(1)
        previousVolume.current = 1
        setStatus({ time: 0, duration: 0, paused: true, ready: false })
        const focusFrame = requestAnimationFrame(() => { if (!root.current?.querySelector('[role=dialog]') && (!root.current?.contains(document.activeElement) || document.activeElement === root.current)) root.current?.querySelector<HTMLButtonElement>('[data-remote-default]')?.focus() })
        const message = (event: MessageEvent) => {
            if (event.origin !== origin || event.source !== frame.current?.contentWindow || event.data?.source !== (nativeAdapter ? "screening-room-player" : "moviesapi-player")) return
            const data = event.data
            if (data.event === "error") {
                latest.current.qualities.reject(url)
                pending.current = null; setRequest(null)
                setError(data.errorCode === "video-unavailable"
                    ? "This server’s video cannot play on this device. Audio has been stopped. Open Quality to choose working video."
                    : latest.current.qualityMode === 'auto' ? 'This video could not play. Auto will try another working option; open Quality to check availability.' : 'This video could not play. Open Quality to choose an available resolution or Auto.')
                if (data.errorCode === "video-unavailable") setStatus(previous => ({ ...previous, paused: true, ready: false }))
                return
            }
            if (!["play", "pause", "ended", "seeked", "timeupdate", "playerstatus"].includes(data.event)) return
            if (frame.current && data.ready !== false) frame.current.dataset.ready = "true"
            if (data.event === "play") setError("")
            const paused = data.event === "play" ? false : data.event === "pause" || data.event === "ended" ? true : typeof data.paused === "boolean" ? data.paused : undefined
            if (pending.current && paused === (pending.current.action === "pause") && (pending.current.action === "pause" || data.ready !== false)) {
                pending.current = null
                setRequest(null)
                setError("")
            }
            setStatus(previous => ({
                ready: data.ready !== false,
                time: typeof data.currentTime === "number" && Number.isFinite(data.currentTime) ? Math.max(0, data.currentTime) : previous.time,
                duration: typeof data.duration === "number" && Number.isFinite(data.duration) ? Math.max(0, data.duration) : previous.duration,
                paused: paused ?? previous.paused,
            }))
        }
        window.addEventListener("message", message)
        const readyTimeout = window.setTimeout(() => {
            if (!frame.current?.dataset.ready) setError("This video is taking too long to load. Open Quality for checked options, or retry Play.")
        }, 25000)
        const timer = window.setInterval(() => {
            if (pending.current) {
                if (Date.now() >= pending.current.deadline) {
                    pending.current = null
                    setRequest(null)
                    setError("The player did not respond. Press Play to retry, or open Quality for checked options.")
                } else {
                    // Explicit play/pause is safe to retry; togglePlay could undo a successful start.
                    send(pending.current.action)
                }
            }
            send("getStatus")
        }, 1000)
        return () => { cancelAnimationFrame(focusFrame); window.removeEventListener("message", message); clearInterval(timer); clearTimeout(readyTimeout) }
    }, [send, url, origin, nativeAdapter, frameRevision])
    const togglePlayback = () => {
        wake()
        const action = pending.current ? pending.current.action === "play" ? "pause" : "play" : status.paused ? "play" : "pause"
        playIntent.current = action === 'play'
        if (resume.current) resume.current.playing = playIntent.current
        pending.current = { action, deadline: Date.now() + 20000 }
        setRequest(action)
        setError("")
        send(action)
    }
    const selectEpisode = (episode: Episode) => {
        if (episode.season === media.seasonNumber && episode.number === media.episodeNumber) return
        send('pause')
        navigate(`/watch/tv/${media.id}?s=${episode.season}&e=${episode.number}`, { replace: true, state: { startPlayback: true } })
    }
    const seek = (time: number) => send("seek", { time: Math.max(0, Math.min(status.duration || time, time)) })
    const changeVolume = (value: number) => {
        const next = Math.max(0, Math.min(1, Math.round(value * 100) / 100))
        setVolume(next); send("setVolume", { volume: next }); wake()
    }
    const toggleMute = () => {
        if (volume > 0) { previousVolume.current = volume; changeVolume(0) }
        else changeVolume(previousVolume.current || 1)
    }
    const toggleFullscreen = () => {
        wake()
        const operation = document.fullscreenElement ? document.exitFullscreen() : root.current?.closest<HTMLElement>("[data-player-fullscreen-root]")?.requestFullscreen()
        operation?.catch(() => setError("Fullscreen could not be changed. Try again."))
    }
    const focus = (selector: string) => {
        const apply = () => { if (!root.current?.querySelector('[role=dialog]')) root.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true }) }
        if (showControls) apply()
        else requestAnimationFrame(apply) // Wait for the waking controls to stop being inert.
    }
    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        wake()
        const target = event.target as HTMLElement
        if (event.key === " " || (event.key === "Enter" && target === root.current)) {
            event.preventDefault(); if (!event.repeat) togglePlayback(); return
        }
        if (event.key.toLowerCase() === "s") { event.preventDefault(); if (!event.repeat) setTracksOpen(true); return }
        if (event.key.toLowerCase() === "f") { event.preventDefault(); if (!event.repeat) toggleFullscreen(); return }
        if (!event.key.startsWith("Arrow") && event.key !== "Enter") return
        const isVolume = target.matches('[aria-label="Volume"]')
        const isTimeline = target.matches('[aria-label="Playback position"]')
        if (isVolume && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault(); changeVolume(volume + (event.key === "ArrowUp" ? 0.05 : -0.05)); return
        }
        if (isTimeline && (event.key === "ArrowLeft" || event.key === "ArrowRight")) return
        if (event.key === "ArrowUp") { event.preventDefault(); focus(isTimeline ? '.cinema-back' : '.cinema-timeline'); return }
        if (event.key === "ArrowDown") { event.preventDefault(); focus('[data-remote-default]'); return }
        if (event.key === "Enter" && isTimeline) { event.preventDefault(); if (!event.repeat) togglePlayback(); return }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault()
            const direction = event.key === "ArrowLeft" ? -1 : 1
            if (target === root.current) { seek(status.time + direction * 10); return }
            const items = [...root.current!.querySelectorAll<HTMLElement>('.remote-player-controls button:not(:disabled), .remote-player-controls input')]
            const index = items.indexOf(target)
            items[Math.max(0, Math.min(items.length - 1, index + direction))]?.focus({ preventScroll: true })
        }
    }
    const label = request === "play" ? "Cancel play" : request === "pause" ? "Play" : status.paused ? "Play" : "Pause"
    const subtitle = [media.releaseDate?.slice(0, 4), media.type === "tv" ? `Season ${media.seasonNumber} · Episode ${media.episodeNumber}` : null].filter(Boolean).join("  ·  ")
    const notice = error || (request === "play" ? "Starting playback…" : request === "pause" ? "Pausing playback…" : !status.ready ? `Waiting for ${provider.name}. Press Play to start.` : "")
    return <section ref={root} className="cinema-player" data-cinema-player data-controls-visible={showControls} tabIndex={0}
        aria-label="Provider player" onKeyDown={onKeyDown} onPointerMove={wake}>
        <iframe key={`${url}:${frameRevision}`} ref={frame} title={`${provider.name} player`} src={url} tabIndex={-1} inert onLoad={() => send("getStatus")}
            className="cinema-video" allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            // These providers reject HTML iframe sandboxing. Qt still blocks top-level escapes,
            // popups, downloads and unapproved frames/scripts in the isolated profile.
            sandbox={nativeAdapter ? undefined : "allow-scripts allow-same-origin allow-forms allow-presentation"} referrerPolicy="no-referrer" />
        <div className="cinema-surface" aria-hidden="true" onClick={() => { if (showControls) togglePlayback(); wake(); root.current?.focus() }} onDoubleClick={toggleFullscreen} />
        <div className="cinema-chrome" inert={!showControls} aria-hidden={!showControls}>
            <header className="cinema-top">
                <button className="cinema-button cinema-back" aria-label="Back" title="Back" onClick={() => history.state?.idx > 0 ? navigate(-1) : navigate("/movies")}><ChevronLeft /></button>
                <div className="cinema-heading"><h1>{media.title}</h1><p>{[subtitle, provider.name].filter(Boolean).join("  ·  ")}</p></div>
                <span className="cinema-paused">{status.paused && !request ? "PAUSED" : ""}</span>
            </header>
            <div className="cinema-bottom">
                <input aria-label="Playback position" type="range" min="0" max={status.duration || 1} step="10" value={status.time} disabled={!status.duration}
                    className="cinema-slider cinema-timeline" style={progress(status.time, status.duration)} onChange={event => { seek(Number(event.target.value)); wake() }} />
                <div className="remote-player-controls">
                    <button className="cinema-button" data-remote-default aria-label={label} title={label} aria-busy={request !== null} onClick={togglePlayback}>{status.paused && request !== "play" ? <Play fill="currentColor" /> : <Pause fill="currentColor" />}</button>
                    <button className="cinema-button cinema-skip" aria-label="Rewind 10 seconds" title="Rewind 10 seconds" onClick={() => { seek(status.time - 10); wake() }} disabled={!status.ready}><RotateCcw /><span>10</span></button>
                    <button className="cinema-button cinema-skip" aria-label="Forward 10 seconds" title="Forward 10 seconds" onClick={() => { seek(status.time + 10); wake() }} disabled={!status.ready}><RotateCw /><span>10</span></button>
                    <button className="cinema-button" aria-label={volume > 0 ? "Mute" : "Unmute"} title={volume > 0 ? "Mute" : "Unmute"} onClick={toggleMute}>{volume > 0 ? <Volume2 /> : <VolumeX />}</button>
                    <input className="cinema-slider cinema-volume" aria-label="Volume" type="range" min="0" max="1" step="0.05" value={volume} style={progress(volume, 1)} onChange={event => changeVolume(Number(event.target.value))} />
                    <span className="cinema-time">{stamp(status.time)} <span>/</span> {stamp(status.duration)}</span>
                    <div className="cinema-spacer" />
                    {media.type === 'tv' && <>
                        <button className="cinema-button" aria-label="Next episode" title={nextEpisode ? `Next: S${nextEpisode.season} E${nextEpisode.number}` : preparation.guide.loading ? 'Checking next episode' : 'No next episode available'} disabled={!nextEpisode} onClick={() => nextEpisode && selectEpisode(nextEpisode)}><SkipForward /></button>
                        <button ref={episodesButton} className="cinema-button" aria-label="Episodes" title="Choose episode" aria-haspopup="dialog" aria-expanded={episodesOpen} onClick={() => { setEpisodesOpen(true); wake() }}><ListVideo /></button>
                    </>}
                    <button ref={qualityButton} className="cinema-button cinema-quality" aria-label="Quality" title="Video quality" aria-haspopup="dialog" aria-expanded={qualityOpen} onClick={() => { setQualityOpen(true); wake() }}><Settings2 /><span>{qualityMode === 'auto' ? 'Auto' : qualityMode === 'manual' ? 'Quality' : `${qualityMode}p`}{currentQuality && qualityMode !== currentQuality ? ` · ${currentQuality}p` : ''}</span></button>
                    <button ref={serversButton} className="cinema-button cinema-servers" aria-label="Servers" title="Manual source selection" aria-haspopup="dialog" aria-expanded={serversOpen} onClick={() => { setServersOpen(true); wake() }}><Server /></button>
                    <button ref={tracksButton} className="cinema-button cinema-tracks" aria-label="Audio & subtitles" title="Audio & subtitles (S)" aria-haspopup="dialog" aria-expanded={tracksOpen} onClick={() => { setTracksOpen(true); wake() }}><Captions /><span>Audio &amp; subtitles</span></button>
                    <button className="cinema-button" aria-label="Fullscreen" title="Fullscreen (F)" onClick={toggleFullscreen}>{fullscreen ? <Minimize /> : <Maximize />}</button>
                </div>
                <p className="cinema-hints">↑ Timeline　 ← → Controls　 OK Select　 Back Exit</p>
            </div>
        </div>
        {status.paused && status.ready && !notice && <Play className="cinema-center-play" fill="currentColor" aria-hidden="true" />}
        <p className="cinema-notice" role="status">{notice}</p>
        <RemoteTracksDialog key={`tracks:${url}`} open={tracksOpen} onOpenChange={open => { setTracksOpen(open); wake() }} frame={frame} container={root.current} trigger={tracksButton} origin={origin} />
        {media.type === 'tv' && <EpisodeDialog id={media.id} season={media.seasonNumber || 1} episode={media.episodeNumber || 1}
            open={episodesOpen} onOpenChange={value => { setEpisodesOpen(value); wake() }} container={root.current} trigger={episodesButton} onSelect={selectEpisode} />}
        <QualityDialog open={qualityOpen} onOpenChange={open => { setQualityOpen(open); wake() }} container={root.current} trigger={qualityButton}
            mode={qualityMode} current={currentQuality} options={qualities.results} checking={!!qualities.probe || anime.loading} lookupFailed={!!anime.error}
            onSelect={chooseQuality} onRetry={() => { if (error || !status.ready) setFrameRevision(n => n + 1); setTargetQuality(null); setError(''); qualities.retry(); anime.retry() }} />
        <Dialog.Root open={serversOpen} onOpenChange={open => { setServersOpen(open); wake() }}>
            <Dialog.Portal container={root.current}>
                <Dialog.Overlay className="cinema-server-shade" />
                <Dialog.Content className="cinema-server-dialog" onKeyDown={event => event.stopPropagation()}
                    onOpenAutoFocus={event => { event.preventDefault(); root.current?.querySelector<HTMLButtonElement>('[data-current-server="true"]')?.focus() }}
                    onCloseAutoFocus={event => {
                        event.preventDefault()
                        const changed = switchedServer.current; switchedServer.current = false
                        if (changed) requestAnimationFrame(() => focus('[data-remote-default]'))
                        else serversButton.current?.focus()
                        wake()
                    }}>
                    <div className="cinema-server-heading"><Dialog.Title>Servers</Dialog.Title><Dialog.Close className="cinema-button" aria-label="Close servers"><X /></Dialog.Close></div>
                    <Dialog.Description>Try another server if playback stalls. Switching may restart the movie.</Dialog.Description>
                    <div className="cinema-server-list">
                        {serverSources.map(source => <button key={source.url} className="cinema-server-option" data-current-server={source.url === url}
                            aria-label={source.provider.name} aria-current={source.url === url ? "true" : undefined}
                            aria-disabled={!!screeningServerIssue(source.provider.id) || undefined}
                            data-remote-unavailable={!!screeningServerIssue(source.provider.id) || undefined}
                            onClick={() => { if (screeningServerIssue(source.provider.id)) return; setQualityMode('manual'); setTargetQuality(null); resume.current = null; if (source.url !== url) { switchedServer.current = true; send("pause"); onSelectSource(source) } setServersOpen(false); wake() }}>
                            <Server /><span>{source.provider.name}{screeningManualFallback(source.provider.id) && <small className="cinema-server-issue">Manual fallback</small>}{screeningServerIssue(source.provider.id) && <small className="cinema-server-issue">{screeningServerIssue(source.provider.id)}</small>}</span>{source.url === url && <><small>Current</small><Check /></>}
                        </button>)}
                    </div>
                    {anime.loading && <p role="status">Checking anime servers…</p>}
                    {anime.error && <div className="cinema-server-retry"><p role="status">{anime.error}</p><button className="cinema-server-option" onClick={anime.retry}>Retry anime servers</button></div>}
                    {!anime.loading && !anime.error && <p className="cinema-server-help">{anime.sources.length ? "Anime sub: original audio with subtitles. Anime dub: dubbed version. Availability varies by episode." : "No anime episode match found for this title."}</p>}
                    <p className="cinema-server-help">↑ ↓ Choose server　 OK Select　 Back Cancel</p>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    </section>
}
