import { DocumentedEmbedProvider } from '../../lib/documented-embed-provider.js';
import { streamSetting } from '../../config/stream-settings.js';
// https://github.com/vidbox1/vidplus — Base Endpoints
export class VidPlusProvider extends DocumentedEmbedProvider {
    readonly id = 'vidplus';
    readonly name = 'VidPlus';
    readonly BASE_URL = streamSetting('STREAM_CORE_VIDPLUS_BASE_URL');
    protected moviePath(id: string) { return `/embed/movie/${id}`; }
    protected tvPath(id: string, s: number, e: number) { return `/embed/tv/${id}/${s}/${e}`; }
}
