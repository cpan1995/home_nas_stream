import { BaseProvider } from '@omss/framework';
import type { ProviderCapabilities, ProviderMediaObject, ProviderResult } from '@omss/framework';

/** Documented browser players. An available HTML page does not prove playback. */
export abstract class DocumentedEmbedProvider extends BaseProvider {
    readonly enabled = true;
    readonly HEADERS = { Accept: 'text/html' };
    abstract readonly BASE_URL: string;
    readonly capabilities: ProviderCapabilities = { supportedContentTypes: ['movies', 'tv'] };
    protected abstract moviePath(id: string): string;
    protected abstract tvPath(id: string, season: number, episode: number): string;
    protected acceptsDestination(requested: URL, destination: URL): boolean {
        return requested.origin === destination.origin && requested.pathname === destination.pathname;
    }

    buildEmbedUrl(media: ProviderMediaObject): string {
        if (!/^[1-9]\d*$/.test(media.tmdbId)) throw new Error('Invalid TMDB ID');
        if (media.type === 'movie') return new URL(this.moviePath(media.tmdbId), this.BASE_URL).href;
        if (media.type !== 'tv' || !Number.isSafeInteger(media.s) || !Number.isSafeInteger(media.e) || media.s! < 1 || media.e! < 1) {
            throw new Error('TV requests require positive season and episode numbers');
        }
        return new URL(this.tvPath(media.tmdbId, media.s!, media.e!), this.BASE_URL).href;
    }

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> { return this.getSources(media); }
    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> { return this.getSources(media); }

    private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
        try {
            const url = this.buildEmbedUrl(media);
            const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: this.HEADERS });
            if (!response.ok) {
                await response.body?.cancel();
                throw new Error(`Embed page returned HTTP ${response.status}`);
            }
            // Do not silently accept a redirect to a homepage or a different service.
            if (response.url && !this.acceptsDestination(new URL(url), new URL(response.url))) {
                await response.body?.cancel();
                throw new Error('Embed redirected away from its documented player URL');
            }
            if (!response.headers.get('content-type')?.includes('text/html')) {
                await response.body?.cancel();
                throw new Error('Expected an HTML player page');
            }
            const reader = response.body?.getReader();
            if (!reader) throw new Error('Empty player response');
            const chunks: Uint8Array[] = [];
            let bytes = 0;
            try {
                while (bytes < 524288) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value); bytes += value.byteLength;
                }
            } finally { await reader.cancel(); }
            const html = Buffer.concat(chunks).toString('utf8');
            if (!/<(?:!doctype\s+html|html|iframe|video)\b/i.test(html)) throw new Error('Response is not an HTML player document');
            const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
            if (/just a moment|attention required|access denied|not found|service unavailable|domain.*sale/i.test(title) || /cf-chl-|challenges\.cloudflare\.com\/turnstile/i.test(html)) {
                throw new Error('Player unavailable or requires browser verification');
            }
            return {
                sources: [{ url: this.createProxyUrl(url), type: 'embed', quality: 'unknown', audioTracks: [], provider: { id: this.id, name: this.name } }],
                subtitles: [],
                diagnostics: [{ code: 'TYPE_INFERRED', severity: 'info', field: 'sources', message: `${this.name}: browser embed page reachable; video playback, quality and audio languages not verified` }]
            };
        } catch (error) {
            return { sources: [], subtitles: [], diagnostics: [{ code: 'PROVIDER_ERROR', severity: 'error', field: '', message: `${this.name}: ${error instanceof Error ? error.message : 'Embed lookup failed'}` }] };
        }
    }
}

/** OMSS 1.1.26 validates wrapped URLs; expose embeds directly after that check. */
export function exposeEmbedUrls<T>(payload: T): T {
    if (!payload || typeof payload !== 'object' || !('sources' in payload) || !Array.isArray(payload.sources)) return payload;
    return { ...payload, sources: payload.sources.map(source => {
        if (source?.type !== 'embed' || typeof source.url !== 'string') return source;
        try {
            const encoded = new URL(source.url).searchParams.get('data');
            if (!encoded) return source;
            const upstream = JSON.parse(encoded);
            const url = new URL(upstream.url);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return source;
            return { ...source, url: url.href };
        } catch { return source; }
    }) };
}
