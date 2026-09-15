import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { OMSSServer } from '@omss/framework';
import { installNetworkGuard } from './local-network.mjs';
import { knownThirdPartyProxies } from './dist/thirdPartyProxies.js';
import { streamPatterns } from './dist/streamPatterns.js';
import { exposeEmbedUrls } from './dist/lib/documented-embed-provider.js';

const metadataConfigured = Boolean(process.env.TMDB_READ_ACCESS_TOKEN);
installNetworkGuard(process.env.TMDB_READ_ACCESS_TOKEN);
const localToken = process.env.CINEPRO_API_TOKEN;
if (!localToken || localToken.length < 32) throw new Error('CINEPRO_API_TOKEN must contain at least 32 characters');
delete process.env.TMDB_READ_ACCESS_TOKEN;
delete process.env.CINEPRO_API_TOKEN;

const server = new OMSSServer({
  name: 'CinePro web core', version: '1.0.0',
  host: '0.0.0.0', port: 3030, publicUrl: 'http://core:3030',
  cache: { type: 'memory', ttl: { sources: 3600, subtitles: 86400 } },
  tmdb: { apiKey: 'local-bearer-adapter', cacheTTL: 86400 },
  proxyConfig: { knownThirdPartyProxies, streamPatterns },
  cors: { origin: false },
  stremio: { enableNativeAddon: false, stremioAddons: [] },
  mcp: { enabled: false },
});

const app = server.getInstance();
app.addHook('preSerialization', async (_request, _reply, payload) => exposeEmbedUrls(payload));
let requests = 0, windowStart = Date.now();
app.addHook('onRequest', async (request, reply) => {
  if (request.headers.origin) return reply.code(403).send({ error: 'Browser access is disabled' });
  const supplied = Buffer.from(request.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${localToken}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return reply.code(401).send({ error: 'Authentication required' });
  }
  const path = request.url.split('?')[0];
  if (request.method !== 'GET' || !/^\/v1\/(?:health|refresh\/[A-Za-z0-9_-]{1,128}|movies\/[1-9]\d*|tv\/[1-9]\d*\/seasons\/\d+\/episodes\/[1-9]\d*)$/.test(path)) {
    return reply.code(404).send({ error: 'Endpoint unavailable' });
  }
  if (path === '/v1/health') return reply.send({ spec: 'omss', name: 'CinePro web core', version: '1.0.0', status: metadataConfigured ? 'operational' : 'unconfigured', configured: metadataConfigured, endpoints: { movie: '/v1/movies/{id}', tv: '/v1/tv/{id}/seasons/{s}/episodes/{e}', refresh: '/v1/refresh/{responseId}' } });
  if (!metadataConfigured) return reply.code(503).send({ error: 'Streaming metadata is not configured' });
  if (Date.now() - windowStart > 60000) { requests = 0; windowStart = Date.now(); }
  if (++requests > 120) return reply.code(429).send({ error: 'Request limit reached' });
});

await server.getRegistry().discoverProviders(fileURLToPath(new URL('./dist/providers/', import.meta.url)));
await server.start();
const stop = async () => { await server.stop(); process.exit(0); };
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
