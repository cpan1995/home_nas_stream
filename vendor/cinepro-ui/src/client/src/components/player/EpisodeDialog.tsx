import { useState, type RefObject } from 'react'
import { Dialog } from 'radix-ui'
import { Check, X } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEpisodeGuide, type Episode } from './hooks/useEpisodeGuide'

export function EpisodeDialog({ id, season, episode, open, onOpenChange, container, trigger, onSelect }: {
    id: string; season: number; episode: number; open: boolean; onOpenChange: (value: boolean) => void;
    container: HTMLElement | null; trigger: RefObject<HTMLButtonElement | null>; onSelect: (episode: Episode) => void;
}) {
    const [selectedSeason, setSelectedSeason] = useState(season)
    const guide = useEpisodeGuide(id, selectedSeason, episode, open)
    return <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal container={container}>
            <Dialog.Overlay className="cinema-server-shade" />
            <Dialog.Content className="cinema-server-dialog cinema-episode-dialog" onKeyDown={event => event.stopPropagation()}
                onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus() }}>
                <div className="cinema-server-heading"><Dialog.Title>Episodes</Dialog.Title><Dialog.Close className="cinema-button" aria-label="Close episodes"><X /></Dialog.Close></div>
                <Dialog.Description>Choose an episode. Playback starts in Auto.</Dialog.Description>
                <Select value={String(selectedSeason)} onValueChange={value => setSelectedSeason(Number(value))}>
                    <SelectTrigger aria-label="Episode season"><SelectValue placeholder={`Season ${selectedSeason}`} /></SelectTrigger>
                    <SelectContent container={container} className="z-[70]">{guide.seasons.map(s => <SelectItem key={s.number} value={String(s.number)}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                {guide.loading ? <p role="status">Loading episodes…</p> : guide.error ? <div><p role="status">{guide.error}</p><button className="cinema-server-option" onClick={guide.retry}>Retry episodes</button></div> :
                    <div className="cinema-server-list cinema-episode-list">
                        {guide.episodes.map(e => <button key={e.number} className="cinema-server-option" aria-current={e.season === season && e.number === episode ? 'true' : undefined}
                            aria-disabled={!e.available || undefined} data-remote-unavailable={!e.available || undefined}
                            onClick={() => { if (e.available) { onOpenChange(false); onSelect(e) } }}>
                            <span>Episode {e.number}: {e.name}{!e.available && <small className="cinema-quality-detail">Available {e.airDate}</small>}</span>
                            {e.season === season && e.number === episode && <Check aria-label="Current episode" />}
                        </button>)}
                        {!guide.episodes.length && <p role="status">No episodes listed for this season.</p>}
                    </div>}
                <p className="cinema-server-help">↑ ↓ Choose episode　 OK Play　 Back Close</p>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
}
