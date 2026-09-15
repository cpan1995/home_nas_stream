import { useMediaWatchContext } from "./providers/MediaWatchProvider"

export function EmbeddedPlayer() {
    const { state, selectSource } = useMediaWatchContext()
    const playback = state.media!.playback
    const source = playback.selectedSource!
    return <section className="flex h-screen w-full flex-col bg-black pt-16" aria-label="Provider player">
        <iframe key={source.url} title={`${source.provider.name} player`} src={source.url}
            className="min-h-0 w-full flex-1 border-0" allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen sandbox="allow-scripts allow-same-origin allow-forms allow-presentation" referrerPolicy="no-referrer" />
        <div className="flex items-center justify-between gap-4 border-t border-white/10 p-4 text-white">
            <label className="flex items-center gap-3">Source
                <select aria-label="Playback source" className="max-w-80 rounded border border-white/30 bg-black p-2"
                    value={source.url} onChange={event => { const next = playback.sources.find(item => item.url === event.target.value); if (next) selectSource(next) }}>
                    {playback.sources.map((item,index) => <option key={item.url} value={item.url}>{item.provider.name} — {item.quality} ({index+1})</option>)}
                </select>
            </label>
            <span className="text-sm text-white/70">Use the provider’s playback controls.</span>
        </div>
    </section>
}
