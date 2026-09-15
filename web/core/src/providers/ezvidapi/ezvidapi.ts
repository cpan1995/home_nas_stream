import { DocumentedEmbedProvider } from '../../lib/documented-embed-provider.js';
import { streamSetting } from '../../config/stream-settings.js';
// https://ezvidapi.com/ — documented embeds. Direct API schema remains unverified.
export class EzvidAPIProvider extends DocumentedEmbedProvider {
    readonly id = 'ezvidapi';
    readonly name = 'ezvidapi';
    readonly BASE_URL = streamSetting('STREAM_CORE_EZVIDAPI_BASE_URL');
    protected moviePath(id: string) { return `/embed/movie/${id}`; }
    protected tvPath(id: string, s: number, e: number) { return `/embed/tv/${id}/${s}/${e}`; }
}
