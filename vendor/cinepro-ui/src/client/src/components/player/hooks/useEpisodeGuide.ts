import { useEffect, useState } from 'react'

export type Episode = { season: number; number: number; name: string; airDate: string; available: boolean }
export type Season = { number: number; name: string }
type Guide = { key: string; episodes: Episode[]; seasons: Season[]; next: Episode[]; loading: boolean; error: string }
const metadata = new Map<string, { at: number; value: any }>()
async function get(path: string, signal: AbortSignal) {
    const cached = metadata.get(path)
    if (cached && Date.now() - cached.at < 120000) return cached.value
    const response = await fetch(`/api/tmdb/3/${path}`, { signal })
    if (!response.ok) throw Error('Episodes could not be loaded.')
    const value = await response.json()
    if (metadata.size >= 30) metadata.delete(metadata.keys().next().value!)
    metadata.set(path, { at: Date.now(), value })
    return value
}
const rows = (value: any, season: number): Episode[] => (Array.isArray(value?.episodes) ? value.episodes : [])
    .filter((e: any) => Number.isSafeInteger(e.episode_number) && e.episode_number > 0)
    .map((e: any) => ({ season, number: e.episode_number, name: String(e.name || `Episode ${e.episode_number}`), airDate: String(e.air_date || ''),
        available: !e.air_date || e.air_date <= new Date().toISOString().slice(0, 10) }))
    .sort((a: Episode, b: Episode) => a.number - b.number)

export function useEpisodeGuide(id: string, season: number, episode: number, enabled = true) {
    const key = `${id}:${season}:${episode}:${enabled}`
    const [attempt, setAttempt] = useState(0)
    const empty: Guide = { key, episodes: [], seasons: [], next: [], loading: enabled, error: '' }
    const [state, setState] = useState<Guide>(empty)
    useEffect(() => {
        if (!enabled || !id) return
        let active = true
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000)
        setState({ key, episodes: [], seasons: [], next: [], loading: true, error: '' })
        void (async () => {
            try {
                const [show, details] = await Promise.all([get(`tv/${id}`, controller.signal), get(`tv/${id}/season/${season}`, controller.signal)])
                const seasons: Season[] = (Array.isArray(show.seasons) ? show.seasons : [])
                    .filter((s: any) => Number.isSafeInteger(s.season_number) && s.season_number > 0 && s.episode_count > 0)
                    .map((s: any) => ({ number: s.season_number, name: String(s.name || `Season ${s.season_number}`) }))
                    .sort((a: Season, b: Season) => a.number - b.number)
                if (!seasons.some(s => s.number === season)) seasons.push({ number: season, name: `Season ${season}` })
                const episodes = rows(details, season)
                const next = episodes.filter(e => e.number > episode && e.available).slice(0, 2)
                // Only fetch one adjacent season's metadata at the boundary.
                const following = seasons.find(s => s.number > season)
                if (next.length < 2 && following) {
                    try { next.push(...rows(await get(`tv/${id}/season/${following.number}`, controller.signal), following.number).filter(e => e.available).slice(0, 2 - next.length)) }
                    catch { /* Keep the current season usable if the next season cannot load. */ }
                }
                if (active) setState({ key, episodes, seasons, next, loading: false, error: '' })
            } catch {
                if (active) setState({ key, episodes: [], seasons: [], next: [], loading: false, error: 'Episodes could not be loaded. Try again.' })
            } finally { clearTimeout(timer) }
        })()
        return () => { active = false; controller.abort(); clearTimeout(timer) }
    }, [key, id, season, episode, enabled, attempt])
    return { ...(state.key === key ? state : empty), retry: () => setAttempt(n => n + 1) }
}
