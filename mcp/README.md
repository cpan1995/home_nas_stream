# Screening Room MCP

Local, stdio-based MCP server wrapping the native app's existing HTTP remote.
Requires Node.js 22+ and the running **native application** with its network
remote enabled. The Vite browser preview does not provide this receiver.

## Install and connect locally

From the project root:

```sh
rtk proxy npm ci --prefix mcp
rtk proxy node --test mcp/*.test.mjs
```

Add this entry to your Codex MCP configuration, adjusting the absolute path for
your checkout:

```toml
[mcp_servers.screening_room]
command = "node"
args = ["/path/to/home_nas_stream/mcp/server.mjs"]

[mcp_servers.screening_room.env]
SCREENING_ROOM_REMOTE_URL = "http://127.0.0.1:8060"
```

Use an absolute Node executable path if your MCP host does not inherit your shell's
PATH. Restart/reconnect the MCP client after adding its configuration. This
repository does not edit your Codex settings automatically.

The client starts the server and communicates over stdin/stdout. Launch the Node
file directly in MCP configuration; terminal wrappers or npm banners can interfere
with protocol output. Running it manually waits for MCP input and shows no prompt.
See [Codex MCP setup](https://developers.openai.com/codex/mcp/).

## Tools

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `get_status` | none | Active app (`nas` or `cinepro`) and app volume; `null` means unavailable |
| `press_button` | `button` | One navigation, transport, volume, or keyboard button |
| `type_text` | `text` | Append a single line to the focused search field, up to 256 UTF-16 code units |
| `open_app` | `app`: `nas` or `cinepro` | Open the chosen app view |
| `search_titles` | `query`, optional `app` | Reset the app, open search, and enter a fresh title query |
| `focus_search_results` | optional `app` | Attempt to move from the search input to results using the app's keyboard route |

Buttons: `Up`, `Down`, `Left`, `Right`, `Select`, `Back`, `Home`, `Play`, `Rev`,
`Fwd`, `InstantReplay`, `VolumeUp`, `VolumeDown`, `VolumeMute`, `Search`,
`Backspace`, `Enter`, `Info`.

Examples: “Open CinePro”, “Go right and select”, “Toggle playback”, “Turn the
volume down”, or “Open search and type Interstellar”. Dependent commands must
run sequentially. Text entry neither clears existing text nor submits search.

`Play` toggles play/pause. `Rev`/`InstantReplay` and `Fwd` skip 10 seconds.
`Home` returns to NAS and stops playback. Volume affects the app, not the TV's
speakers. CinePro support depends on the current provider.

Individual button/text/app mutations return `{ "accepted": true }`: the receiver accepted the
command, but this does not confirm the resulting screen or playback. Status
does not include title, playback position, or paused state. Search result
readback, play-by-ID, explicit pause/resume, absolute volume, and TV power are
not exposed.

## Prepared title-search scripts

Call `search_titles` with `{"query":"Interstellar","app":"cinepro"}` or
`{"query":"Spirited Away","app":"nas"}`. Omit `app` to use the active app.
The query is validated before any navigation takes place.

**Searching returns home and stops playback.** NAS is reloaded to start a fresh
search; CinePro is reset through NAS and its home command so an old query is not
retained. The script opens Search, waits for focus, enters the query once, and
leaves the input focused. It never selects a title or starts playback.

The default waits are 2.5 seconds per app load, 250 milliseconds for search focus,
and one second after typing. These are fixed delays, not readiness detection.
Slow page loads, catalog requests, or another remote can interrupt the workflow.
Success reports `status: "query_entered"` and `resultsVerified: false`; this is
an acknowledged command sequence, not confirmation of matching titles.

After visible results have loaded and while the input is still focused, call
`focus_search_results` once. NAS uses Enter. CinePro uses five Down presses:
input → keyboard row 1 → row 2 → row 3 → action row → results/status. Then use
individual buttons to reach a title verified on the screen. Do not repeat this
macro blindly: Enter on a NAS result selects it. This tool verifies the active
app, but cannot verify input focus or result availability.

The same search script is available directly from the project root:

```sh
rtk proxy node mcp/search.mjs --app cinepro --query 'Interstellar'
```

The [screening-room-search skill](skills/screening-room-search/SKILL.md) explains
the complete workflow and recovery rules. MCP clients can read it as the
`screening-room://skills/title-search` resource. With the project skill link
installed, Codex can invoke it as `$screening-room-search`.

Tools within one MCP server instance reject overlapping calls while a workflow
is running. This does not lock out phone remotes or other server instances.
Failures stop the sequence and report the stage and acknowledged-command count;
the failing command may also have executed. Commands are never replayed
automatically. Reconnect the Inspector/MCP client to load newly added tools.

## Connection behavior

The target defaults to `http://127.0.0.1:8060`. The optional
`SCREENING_ROOM_REMOTE_URL` is a fixed HTTP origin using `localhost` or an IPv4
address; credentials, custom paths, query strings, and fragments are rejected.
The native receiver validates Host headers, so other DNS names are not supported.
Tool arguments cannot change the destination or request arbitrary URLs.
CinePro search reset uses the existing phone remote's fixed
`/remote/command/CineProHome` endpoint with its required exact Origin header.
Other controls continue using ECP endpoints without a browser Origin.

Requests time out after three seconds; redirects and automatic retries are
disabled. After a failed command, the result can be uncertain: avoid replaying
toggles or text without checking the TV. If the receiver is unavailable, start
the native app and check its remote port. HTTP 403 can indicate receiver network
restrictions; 429 indicates rate limiting.

This MCP server opens no listening port and needs no OpenAI API key. Its HTTP
target is the existing receiver described in [REMOTE.md](../REMOTE.md), which
should remain restricted to the home network. No Pi deployment, autostart
configuration, or remote connection is performed by this package.

## Development

Dependencies and their lockfile are isolated in this directory. Tests use local
HTTP fixtures, injected workflow timing, and a real MCP client/server stdio
connection; they do not operate the live player. These checks cover request
ordering and error handling. Actual UI focus, load timing, hardware playback,
and CinePro provider behavior require separate manual verification.

Built with the [official MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x).
