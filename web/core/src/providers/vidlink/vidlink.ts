import { DocumentedEmbedProvider } from '../../lib/documented-embed-provider.js';
import { streamSetting } from '../../config/stream-settings.js';
// https://vidlink.pro/ — API Documentation
export class VidLinkProvider extends DocumentedEmbedProvider {
    readonly id = 'vidlink';
    readonly name = 'VidLink';
    readonly BASE_URL = streamSetting('STREAM_VIDLINK_ORIGIN');
    protected moviePath(id: string) { return `/movie/${id}`; }
    protected tvPath(id: string, s: number, e: number) { return `/tv/${id}/${s}/${e}`; }
}
