import { parseArgs } from 'node:util';
import { createRemote, validateText } from './remote.mjs';
import { createWorkflows } from './workflows.mjs';

try {
  const { values } = parseArgs({
    options: { query: { type: 'string' }, app: { type: 'string' }, help: { type: 'boolean' } },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    console.log('Usage: node mcp/search.mjs --query "Title" [--app nas|cinepro]\nReturns home and stops playback before entering a fresh search. Leaves input focused; does not choose a result.');
  } else {
    validateText(values.query);
    if (!values.query.trim()) throw new Error('Query must contain a title.');
    if (values.app !== undefined && !['nas', 'cinepro'].includes(values.app)) throw new Error('App must be nas or cinepro.');
    const remote = createRemote({ baseUrl: process.env.SCREENING_ROOM_REMOTE_URL ?? 'http://127.0.0.1:8060' });
    const result = await createWorkflows(remote).searchTitles({ query: values.query, app: values.app });
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
