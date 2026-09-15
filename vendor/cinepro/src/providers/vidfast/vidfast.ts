import { DocumentedEmbedProvider } from '../../lib/documented-embed-provider.js';
import { streamSetting } from '../../config/stream-settings.js';
// https://vidfast.domains/ lists this domain; https://vidfast.vc/ documents paths.
export class VidFastProvider extends DocumentedEmbedProvider {
    readonly id = 'vidfast';
    readonly name = 'VidFast';
    readonly BASE_URL = streamSetting('STREAM_VIDFAST_ORIGIN');
    protected moviePath(id: string) { return `/movie/${id}`; }
    protected tvPath(id: string, s: number, e: number) { return `/tv/${id}/${s}/${e}`; }
}
