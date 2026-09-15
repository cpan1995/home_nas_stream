import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { screeningRoom, screeningServerSources } from '@/lib/screening-room'
import { QualityProbe, useQualitySources } from './QualityProbe'
import { useAnimeServers } from './hooks/useAnimeServers'
import { useEpisodeGuide, type Episode } from './hooks/useEpisodeGuide'

export type StreamTarget = { id: string; type: 'movie' | 'tv'; seasonNumber?: number; episodeNumber?: number }
export const streamKey = (t: StreamTarget) => `${t.type}:${t.id}:${t.seasonNumber}:${t.episodeNumber}`
const none: StreamTarget = { id: '', type: 'movie' }
function targetFrom(path: string, search: string): StreamTarget | null {
    const query = new URLSearchParams(search), watch = /^\/watch\/(movie|tv)\/([1-9]\d*)\/?$/.exec(path)
    const drawer = /^(movie|tv)-([1-9]\d*)$/.exec(query.get('media') || '')
    const match = watch || drawer
    if (!match) return null
    const type = match[1] as 'movie' | 'tv', id = match[2]
    if (type === 'movie') return { type, id }
    const seasonNumber = watch ? Number(query.get('s') || 1) : 1, episodeNumber = watch ? Number(query.get('e') || 1) : 1
    return [seasonNumber, episodeNumber].every(n => Number.isSafeInteger(n) && n > 0) ? { type, id, seasonNumber, episodeNumber } : null
}
type Prepared = {
    key: string; anime: ReturnType<typeof useAnimeServers>; qualities: ReturnType<typeof useQualitySources>;
    guide: ReturnType<typeof useEpisodeGuide>; setDub: (value: boolean) => void; started: (nearEnd: boolean) => void;
}
const Context = createContext<Prepared | null>(null)
export function useStreamPreparation() { return useContext(Context) }

export function StreamPreparation({ children }: { children: ReactNode }) {
    if (!screeningRoom) return <>{children}</>
    return <PreparationSession>{children}</PreparationSession>
}
function PreparationSession({ children }: { children: ReactNode }) {
    const location = useLocation(), wanted = targetFrom(location.pathname, location.search)
    const wantedKey = wanted ? streamKey(wanted) : ''
    const [retained, setRetained] = useState<StreamTarget | null>(wanted)
    // The drawer closes one animation frame before navigation to Play. Keep the
    // same checker alive across that handoff, then cancel an actual dismissal.
    useEffect(() => {
        if (wanted) { setRetained(wanted); return }
        const timer = setTimeout(() => setRetained(null), 250)
        return () => clearTimeout(timer)
    }, [wantedKey])
    const target = wanted || retained || none, key = streamKey(target)
    const [language, setLanguage] = useState({ key: '', dub: false })
    const dub = language.key === key && language.dub
    const anime = useAnimeServers(target)
    const sources = target.id ? [...screeningServerSources(target.id, target.seasonNumber, target.episodeNumber), ...anime.sources] : []
    const qualities = useQualitySources(sources, key, dub)
    const guide = useEpisodeGuide(target.id, target.seasonNumber || 1, target.episodeNumber || 1, target.type === 'tv' && !!target.id)
    const [startedKey, setStartedKey] = useState(''), [endingKey, setEndingKey] = useState('')
    const watch = location.pathname.startsWith('/watch/')
    useEffect(() => { if (!watch) { setStartedKey(''); setEndingKey('') } }, [watch])
    const value: Prepared = { key, anime, qualities, guide, setDub: value => setLanguage({ key, dub: value }), started: nearEnd => { setStartedKey(key); if (nearEnd) setEndingKey(key) } }
    return <Context.Provider value={value}>
        {children}
        <div className="cinema-preparation" aria-hidden="true" inert>
            {target.id && qualities.probe && <QualityProbe key={`${qualities.scope}:${qualities.probe.url}`} source={qualities.probe} onVerified={qualities.verified} onComplete={qualities.completed} />}
            {watch && startedKey === key && qualities.results.length > 0 && !qualities.probe && !anime.loading && guide.next.length > 0 &&
                <UpcomingStreams key={`${key}:${dub}:${endingKey === key}` } id={target.id} episodes={guide.next.slice(0, 2)} dub={dub} />}
        </div>
    </Context.Provider>
}
function UpcomingStreams({ id, episodes, dub }: { id: string; episodes: Episode[]; dub: boolean }) {
    const [index, setIndex] = useState(0), episode = episodes[index]
    if (!episode) return null
    return <UpcomingStream key={`${episode.season}:${episode.number}`} target={{ type: 'tv', id, seasonNumber: episode.season, episodeNumber: episode.number }} dub={dub} done={() => setIndex(n => n + 1)} />
}
function UpcomingStream({ target, dub, done }: { target: StreamTarget; dub: boolean; done: () => void }) {
    const anime = useAnimeServers(target), complete = useRef(done); complete.current = done
    const finished = useRef(false)
    const finish = () => { if (!finished.current) { finished.current = true; complete.current() } }
    const qualities = useQualitySources([...screeningServerSources(target.id, target.seasonNumber, target.episodeNumber), ...anime.sources], streamKey(target), dub)
    useEffect(() => {
        if (qualities.results.length || (!qualities.probe && !anime.loading)) finish()
    }, [qualities.results.length, qualities.probe?.url, anime.loading])
    useEffect(() => { const timer = setTimeout(finish, 30000); return () => clearTimeout(timer) }, [])
    return qualities.probe && !qualities.results.length ? <QualityProbe key={`${qualities.scope}:${qualities.probe.url}`} source={qualities.probe} onVerified={qualities.verified} onComplete={qualities.completed} /> : null
}

export function StreamAvailability({ target }: { target: StreamTarget }) {
    const prepared = useStreamPreparation()
    if (!prepared || prepared.key !== streamKey(target)) return null
    const best = Math.max(0, ...prepared.qualities.results.map(q => q.height))
    const checking = prepared.qualities.probe || prepared.anime.loading
    return <p className="cinema-availability" role="status">{best ? `Ready to play · Auto up to ${best}p` : checking ? 'Checking available streams…' : 'No working stream found yet. You can retry in the player.'}</p>
}
