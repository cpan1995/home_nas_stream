import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { screeningServerIssue, screeningManualFallback } from "@/lib/screening-room"
import type { NormalizedSource } from "./types/source.types"

export type VerifiedQuality = { source: NormalizedSource; id: string; height: number; width: number; checkedAt: number }
export type QualitySample = { resolution: number; width: number; height: number; time: number; frames: number; ready: number; paused: boolean; error?: string; options: { id: string; height: number }[] }
export function qualitySample(value: any): QualitySample | null {
    if (!value || !['resolution', 'width', 'height', 'time', 'frames', 'ready'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0)) return null
    if (value.width > 16384 || value.height > 8640 || value.resolution > 8640 || value.ready > 4) return null
    return { ...value, options: Array.isArray(value.options) ? value.options.filter((o: any) =>
        typeof o?.id === 'string' && /^q:\d{3,4}$/.test(o.id) && Number.isInteger(o.height) && o.height >= 144 && o.height <= 4320).slice(0, 10) : [] }
}
export function decodedSince(before: QualitySample | null, next: QualitySample) {
    return !!before && next.width > 0 && next.height > 0 && next.ready >= 2 && !next.error &&
        next.time - before.time >= .2 && next.time - before.time < 5 && next.frames > before.frames
}
type ScanState = { results: VerifiedQuality[]; done: string[]; rejected: string[]; at: number; revision: number }
const cache = new Map<string, ScanState>()
const listeners = new Map<string, Set<() => void>>()
const lifetime = 120000
function snapshot(scope: string): ScanState {
    if (!cache.has(scope)) {
        if (cache.size >= 20) for (const key of cache.keys()) { if (!listeners.get(key)?.size) { cache.delete(key); break } }
        cache.set(scope, { results: [], done: [], rejected: [], at: Date.now(), revision: 0 })
    }
    return cache.get(scope)!
}
function update(scope: string, change: (previous: ScanState) => ScanState) {
    const before = snapshot(scope), after = change(before)
    if (after === before) return
    cache.set(scope, after)
    listeners.get(scope)?.forEach(notify => notify())
}
export function preparedQuality(mediaKey: string) {
    const state = cache.get(`${mediaKey}:default`)
    return state && Date.now() - state.at < lifetime ? [...state.results].sort((a, b) => b.height - a.height)[0] : undefined
}

// The title drawer, player and bounded episode queue share measurements. Only
// StreamPreparation owns a checker iframe, so subscribing never starts a scan.
export function useQualitySources(sources: NormalizedSource[], mediaKey: string, dub: boolean) {
    const signature = JSON.stringify(sources.map(s => [s.url, s.provider.id]))
    const candidates = useMemo(() => {
        const priority = ['vidfast', 'moviesapi', 'vidlink', 'rivestream', 'anixo-anime-sub', 'cinezo']
        return sources.filter((s, i, all) => s.type === 'embed' && !screeningServerIssue(s.provider.id) && !screeningManualFallback(s.provider.id) &&
            (dub ? s.provider.id.endsWith('-anime-dub') : !s.provider.id.endsWith('-anime-dub')) && all.findIndex(other => other.url === s.url) === i)
            .sort((a, b) => (priority.indexOf(a.provider.id) < 0 ? 99 : priority.indexOf(a.provider.id)) - (priority.indexOf(b.provider.id) < 0 ? 99 : priority.indexOf(b.provider.id)))
    }, [signature, dub])
    const scope = `${mediaKey}:${dub ? 'dub' : 'default'}`
    const subscribe = useCallback((notify: () => void) => {
        const group = listeners.get(scope) || new Set<() => void>()
        group.add(notify); listeners.set(scope, group)
        return () => { group.delete(notify); if (!group.size) listeners.delete(scope) }
    }, [scope])
    const state = useSyncExternalStore(subscribe, useCallback(() => snapshot(scope), [scope]))
    useEffect(() => {
        if (Date.now() - snapshot(scope).at >= lifetime) update(scope, p => ({ results: [], done: [], rejected: [], at: Date.now(), revision: p.revision + 1 }))
    }, [scope])
    const current = Date.now() - state.at < lifetime ? state : { ...state, results: [], done: [], rejected: [] }
    return {
        probe: candidates.find(s => !current.done.includes(s.url)), scope: `${scope}:${state.revision}`,
        results: current.results.filter(q => candidates.some(s => s.url === q.source.url)),
        verified: (option: VerifiedQuality) => update(scope, previous => {
            if (previous.rejected.includes(option.source.url)) return previous
            const results = [...previous.results.filter(q => !(q.source.url === option.source.url && q.height === option.height)), option]
            return { ...previous, results, at: Date.now() }
        }),
        completed: (url: string) => update(scope, p => p.done.includes(url) ? p : { ...p, done: [...p.done, url], at: Date.now() }),
        reject: (url: string) => update(scope, p => p.rejected.includes(url) ? p : { ...p, results: p.results.filter(q => q.source.url !== url), rejected: [...p.rejected, url], at: Date.now() }),
        retry: () => update(scope, p => ({ results: [], done: [], rejected: [], at: Date.now(), revision: p.revision + 1 })),
    }
}

// One muted checker at a time. A manifest/menu label alone is never published
// as available: the device must decode new frames while media time advances.
export function QualityProbe({ source, onVerified, onComplete }: {
    source: NormalizedSource; onVerified: (quality: VerifiedQuality) => void; onComplete: (url: string) => void;
}) {
    const frame = useRef<HTMLIFrameElement>(null)
    const handlers = useRef({ onVerified, onComplete }); handlers.current = { onVerified, onComplete }
    useEffect(() => {
        const session = crypto.randomUUID(), origin = new URL(source.url).origin
        let before: QualitySample | null = null, desired = 'current', wanted = 0, deadline = Date.now() + 22000, finished = false
        const started = Date.now(), tested = new Set<string>(), verified = new Set<number>()
        let choices: QualitySample['options'] = [], settleUntil = 0
        const send = (action: string) => frame.current?.contentWindow?.postMessage({ source: 'screening-room-quality-control', action, session, id: desired }, origin)
        const finish = () => { if (finished) return; finished = true; send('stop'); handlers.current.onComplete(source.url) }
        const next = () => {
            tested.add(desired)
            const option = choices.find(o => !tested.has(o.id) && !verified.has(o.height))
            if (!option || Date.now() - started > 55000) { finish(); return }
            desired = option.id; wanted = option.height; before = null; deadline = Date.now() + 12000; send('probe')
        }
        const message = (event: MessageEvent) => {
            if (finished || event.origin !== origin || event.source !== frame.current?.contentWindow || event.data?.source !== 'screening-room-quality' || event.data.session !== session) return
            const sample = qualitySample(event.data)
            if (!sample) return
            choices = sample.options.sort((a, b) => b.height - a.height)
            if (settleUntil) {
                const option = choices.find(o => o.height === sample.resolution)
                if (option && verified.has(sample.resolution)) handlers.current.onVerified({ source, id: option.id, height: sample.resolution, width: sample.width, checkedAt: Date.now() })
                if (choices.length || Date.now() >= settleUntil) { settleUntil = 0; next() }
                return
            }
            if (sample.error) { next(); return }
            if (decodedSince(before, sample) && (!wanted || sample.resolution === wanted)) {
                const id = choices.find(o => o.height === sample.resolution)?.id || desired
                verified.add(sample.resolution)
                handlers.current.onVerified({ source, id, height: sample.resolution, width: sample.width, checkedAt: Date.now() })
                // Some players render their quality submenu just after the first video frame.
                if (desired === 'current' && !choices.length) settleUntil = Date.now() + 3000
                else next()
                return
            }
            before = sample
        }
        window.addEventListener('message', message)
        const timer = setInterval(() => { if (finished) return; if (settleUntil && Date.now() >= settleUntil) { settleUntil = 0; next() } else if (Date.now() > deadline) next(); else send('probe') }, 600)
        send('probe')
        return () => { finished = true; clearInterval(timer); window.removeEventListener('message', message); send('stop') }
    }, [source.url])
    return <iframe ref={frame} src={source.url} name="screening-room-quality-probe" title="Checking video quality"
        className="cinema-quality-probe" aria-hidden="true" tabIndex={-1} inert allow="autoplay" referrerPolicy="no-referrer" />
}
