import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { OMSSServer } from '@omss/framework';
import { installNetworkGuard } from './local-network.mjs';
import { knownThirdPartyProxies } from './dist/thirdPartyProxies.js';
import { streamPatterns } from './dist/streamPatterns.js';
import { exposeEmbedUrls } from './dist/lib/documented-embed-provider.js';

installNetworkGuard(process.env.TMDB_READ_ACCESS_TOKEN);
const localToken = process.env.LOCAL_API_TOKEN;
if (!localToken || localToken.length < 32) throw new Error('Local API token is missing');
delete process.env.TMDB_READ_ACCESS_TOKEN;
delete process.env.LOCAL_API_TOKEN;

const server = new OMSSServer({
  name: 'CinePro local test', version: '1.0.0',
  host: '127.0.0.1', port: 3030, publicUrl: 'http://127.0.0.1:3030',
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
  if (!['127.0.0.1:3030', 'localhost:3030'].includes(request.headers.host)) {
    return reply.code(403).send({ error: 'Host rejected' });
  }
  if (request.headers.origin) return reply.code(403).send({ error: 'Browser origins disabled for this API test' });
  const supplied = Buffer.from(request.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${localToken}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return reply.code(401).send({ error: 'Local authentication required' });
  }
  if (request.url.split('?')[0] === '/v1/proxy') {
    return reply.code(403).send({ error: 'Public proxy endpoint disabled; source lookup only' });
  }
  if (Date.now() - windowStart > 60000) { requests = 0; windowStart = Date.now(); }
  if (++requests > 30) return reply.code(429).send({ error: 'Local request limit reached' });
});

await server.getRegistry().discoverProviders(fileURLToPath(new URL('./dist/providers/', import.meta.url)));
await server.start();
const stop = async () => { await server.stop(); process.exit(0); };
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
