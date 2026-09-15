import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { BUTTONS, createRemote } from './remote.mjs';
import { createWorkflows } from './workflows.mjs';

const remote = createRemote({
  baseUrl: process.env.SCREENING_ROOM_REMOTE_URL ?? 'http://127.0.0.1:8060',
});
const workflows = createWorkflows(remote);

const server = new McpServer(
  { name: 'screening-room', version: '0.1.0' },
  {
    instructions:
      'For title searches use search_titles, which resets the chosen app and enters a fresh query. It stops playback. Search results cannot be read by this receiver: never claim a title was found. Only call focus_search_results after visible results are ready and the search input is still focused; never choose a result blindly. Never automatically retry failed commands. Issue tools sequentially. Status reports only app and volume; Play toggles playback. CinePro availability depends on the provider.',
  },
);

const accepted = { accepted: z.literal(true) };
const actionAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

function result(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
}

let busy = false;
function handle(operation) {
  return async (args) => {
    if (busy) return { isError: true, content: [{ type: 'text', text: 'Another remote operation is running. Wait for it to finish before issuing another tool call.' }] };
    busy = true;
    try {
      return result(await operation(args));
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error.message }],
      };
    } finally {
      busy = false;
    }
  };
}

server.registerTool('get_status', {
  description: 'Read active app and app volume (0–100, or null when unavailable). Does not report title, playback position, or whether playback is paused.',
  inputSchema: z.object({}).strict(),
  outputSchema: { activeApp: z.enum(['nas', 'cinepro']), volume: z.number().min(0).max(100).nullable() },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, handle(() => remote.getStatus()));

server.registerTool('press_button', {
  description: 'Press one remote button. Play toggles play/pause; Rev or InstantReplay skips back 10 seconds; Fwd skips forward 10 seconds. VolumeUp/Down adjust app volume and VolumeMute toggles mute. Home stops playback and opens NAS. Search opens search; Info opens audio/subtitle controls. No TV power control.',
  inputSchema: z.object({ button: z.enum(BUTTONS) }).strict(),
  outputSchema: accepted,
  annotations: actionAnnotations,
}, handle(({ button }) => remote.pressButton(button)));

server.registerTool('type_text', {
  description: 'Append text to the focused search field. First press Search to open search when needed. Does not clear existing text or submit; use Backspace or Enter separately. Maximum 256 UTF-16 code units, single line. Never automatically replay failed text entry.',
  inputSchema: z.object({ text: z.string().min(1).max(256) }).strict(),
  outputSchema: accepted,
  annotations: actionAnnotations,
}, handle(({ text }) => remote.typeText(text)));

server.registerTool('open_app', {
  description: 'Switch to NAS Library or CinePro. Opening NAS returns home and stops playback. Does not search or play a specific title.',
  inputSchema: z.object({ app: z.enum(['nas', 'cinepro']) }).strict(),
  outputSchema: accepted,
  annotations: actionAnnotations,
}, handle(({ app }) => remote.openApp(app)));

server.registerTool('search_titles', {
  description: 'Run the prepared title-search UI script for NAS or CinePro (defaults to the active app). Returns home, stopping playback and resetting prior search text, opens search, then types the complete query. Leaves the search input focused. Uses timed waits, not UI readiness detection. Does NOT return matching titles or confirm results; inspect the TV before selection. CinePro search uses its online catalog.',
  inputSchema: z.object({ query: z.string().min(1).max(256), app: z.enum(['nas', 'cinepro']).optional() }).strict(),
  annotations: actionAnnotations,
}, handle((args) => workflows.searchTitles(args)));

server.registerTool('focus_search_results', {
  description: 'Move from the search input toward results using the app-specific keyboard route. Call only when the search input is still focused and visible results have finished loading after search_titles. Defaults to active app; an explicit app must match it. Does not read results, select a title, or confirm focus. Do not repeat blindly: Enter behaves differently once a result has focus.',
  inputSchema: z.object({ app: z.enum(['nas', 'cinepro']).optional() }).strict(),
  annotations: actionAnnotations,
}, handle((args) => workflows.focusSearchResults(args)));

server.registerResource('title-search-skill', 'screening-room://skills/title-search', {
  description: 'Agent skill for the prepared NAS/CinePro search scripts, result navigation, and recovery.',
  mimeType: 'text/markdown',
}, async (uri) => ({
  contents: [{
    uri: uri.href,
    mimeType: 'text/markdown',
    text: await readFile(new URL('./skills/screening-room-search/SKILL.md', import.meta.url), 'utf8'),
  }],
}));

// stdout belongs exclusively to MCP; launch this file directly with Node.
await server.connect(new StdioServerTransport());
