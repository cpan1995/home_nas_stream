import { Dialog } from 'radix-ui'
import { Check, RotateCcw, X } from 'lucide-react'
import type { RefObject } from 'react'
import type { VerifiedQuality } from './QualityProbe'

export type QualityMode = 'auto' | 'manual' | number
export function QualityDialog({ open, onOpenChange, container, trigger, mode, current, options, checking, lookupFailed, onSelect, onRetry }: {
    open: boolean; onOpenChange: (open: boolean) => void; container: HTMLElement | null; trigger: RefObject<HTMLButtonElement | null>;
    mode: QualityMode; current: number; options: VerifiedQuality[]; checking: boolean; lookupFailed: boolean;
    onSelect: (value: 'auto' | number) => void; onRetry: () => void;
}) {
    const heights = [...new Set(options.map(q => q.height))].sort((a, b) => b - a)
    const pick = (value: 'auto' | number) => { onSelect(value); onOpenChange(false) }
    return <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal container={container}>
            <Dialog.Overlay className="cinema-server-shade" />
            <Dialog.Content className="cinema-server-dialog cinema-quality-dialog" onKeyDown={event => event.stopPropagation()}
                onOpenAutoFocus={event => { event.preventDefault(); (container?.querySelector<HTMLButtonElement>('.cinema-quality-dialog [aria-checked="true"]') || container?.querySelector<HTMLButtonElement>('.cinema-quality-dialog [role="radio"]'))?.focus() }}
                onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus() }}>
                <div className="cinema-server-heading"><Dialog.Title>Quality</Dialog.Title><Dialog.Close className="cinema-button" aria-label="Close quality"><X /></Dialog.Close></div>
                <Dialog.Description>{current ? `Current video: ${current}p.` : 'Choose from video checked on this device.'}</Dialog.Description>
                <div className="cinema-server-list" role="radiogroup" aria-label="Video quality">
                    <button className="cinema-server-option" role="radio" aria-checked={mode === 'auto'} onClick={() => pick('auto')}>
                        <span>Auto<small className="cinema-quality-detail">Highest working quality{heights.length ? ` · up to ${heights[0]}p` : ''}</small></span>{mode === 'auto' && <Check />}
                    </button>
                    {heights.map(height => <button key={height} className="cinema-server-option" role="radio" aria-checked={mode === height} onClick={() => pick(height)}>
                        <span>{height}p<small className="cinema-quality-detail">{height >= 2160 ? '4K' : height >= 1080 ? 'Full HD' : height >= 720 ? 'HD' : 'Standard definition'}</small></span>
                        <small>Available</small>{mode === height && <Check />}
                    </button>)}
                </div>
                <p className="cinema-quality-status" role="status">{checking ? 'Checking available video quality…' : heights.length ? 'Available qualities have produced video on this device.' : 'No working video found. Try checking again.'}{lookupFailed ? ' Some anime options could not be checked.' : ''}</p>
                <button className="cinema-server-option cinema-quality-retry" onClick={onRetry}><RotateCcw /><span>Check again</span></button>
                <p className="cinema-server-help">↑ ↓ Choose quality　 OK Select　 Back Close</p>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
}
