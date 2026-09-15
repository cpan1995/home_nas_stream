import { DocumentedEmbedProvider } from '../../lib/documented-embed-provider.js';
import { streamSetting } from '../../config/stream-settings.js';
// https://www.superembed.stream/ — Simple way; tmdb=1 is required.
export class SuperEmbedProvider extends DocumentedEmbedProvider {
    readonly id = 'superembed';
    readonly name = 'SuperEmbed';
    readonly BASE_URL = streamSetting('STREAM_CORE_SUPEREMBED_BASE_URL');
    protected moviePath(id: string) { return `/?video_id=${id}&tmdb=1`; }
    protected tvPath(id: string, s: number, e: number) { return `/?video_id=${id}&tmdb=1&s=${s}&e=${e}`; }
    protected acceptsDestination(requested: URL, destination: URL): boolean {
        // Observed redirect from the documented endpoint on 2026-09-06.
        return super.acceptsDestination(requested, destination) || (
            destination.origin === streamSetting('STREAM_CORE_SUPEREMBED_REDIRECT_ORIGIN') && destination.pathname === '/' &&
            Boolean(destination.searchParams.get('play'))
        );
    }
}
