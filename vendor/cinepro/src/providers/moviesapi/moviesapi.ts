import { DocumentedEmbedProvider } from '../../lib/documented-embed-provider.js';
import { streamSetting } from '../../config/stream-settings.js';
// https://moviesapi.to/ — API Documentation
export class MoviesAPIProvider extends DocumentedEmbedProvider {
    readonly id = 'moviesapi';
    readonly name = 'MoviesAPI';
    readonly BASE_URL = streamSetting('STREAM_MOVIESAPI_ORIGIN');
    protected moviePath(id: string) { return `/movie/${id}`; }
    protected tvPath(id: string, s: number, e: number) { return `/tv/${id}/${s}/${e}`; }
}
