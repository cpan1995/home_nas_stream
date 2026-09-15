import { useEffect, useRef, useState, type RefObject } from "react"
import { Dialog } from "radix-ui"
import { Check, X } from "lucide-react"

type Track = { id: string; label: string; selected: boolean }
const trackList = (value: unknown): Track[] => Array.isArray(value) ? value.filter((t): t is Track =>
    t && typeof t.id === "string" && t.id.length < 300 && typeof t.label === "string" && t.label.length < 200 && typeof t.selected === "boolean").slice(0, 200) : []
export function RemoteTracksDialog({ open, onOpenChange, frame, container, trigger, origin }: {
    open: boolean; onOpenChange: (open: boolean) => void; frame: RefObject<HTMLIFrameElement | null>;
    container: HTMLElement | null; trigger: RefObject<HTMLButtonElement | null>; origin: string
}) {
    const [tracks, setTracks] = useState<{ audio: Track[]; subtitles: Track[]; received: boolean; ready: boolean }>({ audio: [], subtitles: [], received: false, ready: false })
    const [error, setError] = useState("")
    const [changing, setChanging] = useState(false)
    const pending = useRef<{ id: string; until: number } | null>(null)
    const send = (action: string, id?: string) => frame.current?.contentWindow?.postMessage({ source: "screening-room-track-control", action, id }, origin)
    useEffect(() => {
        if (!open) return
        setError("")
        const started = Date.now()
        const message = (event: MessageEvent) => {
            if (event.origin !== origin || event.source !== frame.current?.contentWindow || event.data?.source !== "screening-room-tracks") return
            const audio = trackList(event.data.audio), subtitles = trackList(event.data.subtitles)
            setTracks({ audio, subtitles, received: true, ready: event.data.ready === true })
            if (typeof event.data.error === "string" && event.data.error) {
                setError(event.data.error.slice(0, 200)); pending.current = null; setChanging(false)
            }
            const wanted = pending.current?.id
            if (wanted && (wanted === "sub:off" ? !subtitles.some(t => t.selected) : [...audio, ...subtitles].some(t => t.id === wanted && t.selected))) {
                pending.current = null; setChanging(false); setError("")
            }
        }
        window.addEventListener("message", message)
        send("getTracks")
        const timer = setInterval(() => {
            if (pending.current && Date.now() > pending.current.until) {
                pending.current = null; setChanging(false); setError("The server did not confirm the change. Try another track.")
            }
            if (Date.now() - started > 10000) setTracks(previous => previous.received ? previous : { ...previous, received: true })
            send("getTracks")
        }, 1000)
        return () => { clearInterval(timer); window.removeEventListener("message", message); pending.current = null; setChanging(false) }
    }, [open, origin, frame])
    const select = (id: string) => {
        pending.current = { id, until: Date.now() + 8000 }; setError(""); setChanging(true); send("selectTrack", id)
    }
    const option = (track: Track) => <button key={track.id} className="cinema-server-option" aria-pressed={track.selected}
        onClick={() => select(track.id)}><span>{track.label}</span>{track.selected && <Check aria-hidden="true" />}</button>
    return <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal container={container}>
            <Dialog.Overlay className="cinema-server-shade" />
            <Dialog.Content className="cinema-server-dialog cinema-track-dialog" onKeyDown={event => event.stopPropagation()}
                onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus() }}>
                <div className="cinema-server-heading"><Dialog.Title>Audio &amp; subtitles</Dialog.Title><Dialog.Close className="cinema-button" aria-label="Close audio and subtitles"><X /></Dialog.Close></div>
                <Dialog.Description>Choose from the tracks this server provides.</Dialog.Description>
                <div className="cinema-track-list">
                    <h3>Audio</h3>
                    {tracks.audio.length ? tracks.audio.map(option) : <p>{tracks.received ? "This server exposes no alternate audio tracks." : "Checking audio tracks…"}</p>}
                    <h3>Subtitles</h3>
                    {option({ id: "sub:off", label: "Off", selected: !tracks.subtitles.some(t => t.selected) })}
                    {tracks.subtitles.map(option)}
                    {!tracks.subtitles.length && <p>{!tracks.received ? "Checking subtitles…" : tracks.ready ? "No subtitle tracks are available from this server." : "No tracks found yet. Start playback, then check again."}</p>}
                </div>
                <p className="cinema-track-status" role="status">{error || (changing ? "Changing track…" : "↑ ↓ Choose track　 OK Select　 Back Close")}</p>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
}
