# CinePro prototype

The online tab uses the official [CinePro UI](https://github.com/cinepro-org/ui),
pinned at `3d944086d92d0c7d5a203b3466c26cb6a33b3734`. Home, Movies, TV Shows,
Discover, Search, Settings, title details, episodes and the player are the upstream
screens. Screening Room's NAS directory remains the default desktop view.

## Run

Double-click **Launch Screening Room.cmd** and select **CinePro**, or double-click
**Launch CinePro.cmd** to open the same desktop app directly in CinePro.
There is no separate browser window. `npm start` opens NAS Library; the native
`--cinepro` option opens CinePro. Ctrl+1/Ctrl+2 switch views; F6 focuses the current
view. Use the NAS sidebar's CinePro logo and CinePro's NAS Library link to switch;
there is no separate desktop tab bar.
The CinePro logo beneath the NAS film button also opens the CinePro tab. It works
with a click or keyboard Enter, from both the directory and search screens.

The local frontend starts on demand. Desktop mode uses **Quality** to choose
working video across MoviesAPI, VidLink, VidFast, Cinezo and Rivestream. It builds
movie/episode embed URLs from TMDB IDs without starting Core. **Auto** selects the
highest verified resolution and tries another checked source when playback fails.
A numbered selection stays at that resolution; it can try another matching source
but does not silently downgrade. **Servers** remains a secondary manual override.
Quality switches restore playback position and volume when the provider loads. Arrow keys, Enter and Back operate the picker,
including in fullscreen. A separate
QtWebEngine view displays CinePro and its embedded players without the native
NAS/player WebChannel. Switching away destroys the online page, stopping playback;
returning restores the last browsing URL, rather than restarting a movie.
Loading failures have an in-app retry, and the NAS tab stays available.

Every new title or episode starts in **Auto**. Opening title details immediately
starts muted stream checks, alongside metadata loading; Play reuses the same
in-flight check and recent verified results. TV playback includes **Next episode**
and an **Episodes** picker with season selection. Changing episodes preserves
fullscreen and starts playback in Auto. Episodes with a future air date are
listed but cannot be played yet.

Once the current episode is playing and its quality checks finish, preparation
checks only the next **two aired episodes**, one at a time. Each stops at its first
working stream or after 30 seconds. It never checks an entire season's streams.
The queue can cross into the following season, and refreshes near the last two
minutes of playback so older cached links can be checked again. Leaving the
player or selecting another title cancels that episode queue. Checks and verified
results are shared in memory, with a two-minute freshness window.

Rivestream uses its documented `/embed?type=movie&id=...` and
`/embed?type=tv&id=...&season=...&episode=...` routes with TMDB IDs.
Its backend chooses the upstream source; this integration uses the embed rather
than depending on the undocumented scraper API. The native media adapter supplies
remote playback/seek/volume controls and reads the Strata player's subtitle menu,
including Off. The provider's duplicate controls are hidden. Failed or blocked
upstream sources can still require choosing a different server in Screening Room.
Live inspection on 2026-09-06 found that FlowCast returned an unrelated anime for
Rome (TMDB 1891), season 1 episode 1. Returned links are not proof of title matching.
Top Gun: Maverick (TMDB 361743) playback, remote Play/Pause and forward seeking,
and English subtitles/Off were verified on the Pi 5 with Qt 6.8.2. Script
dictionaries set both Qt versions' sub-frame flag spellings so the native adapter
is injected on Raspberry Pi OS as well as the newer desktop Qt build.

Audio-only streams are detected by the native media adapter after five seconds
of advancing playback with no video dimensions. It pauses the media and shows
a message to open Quality; Auto can select another checked source. Buffering and seek jumps do not count.
This handles DASH providers that silently discard an unsupported video track.
On the WSL desktop, Spider-Man (TMDB 557) from Cinezo supplied only HEVC video
representations, which this browser build rejected while continuing AAC audio.
VidFast played the same title with moving 1080p video and seeking. Rivestream's
sources for that title failed during the check. This change detects the failure;
it does not add HEVC decoding to the embedded browser.

The CinePro tab has a native request filter. Scripts and workers are restricted
to the local frontend, configured providers and specified player/trailer dependencies.
Frame navigation accepts documented movie/episode routes on these exact provider hosts, privacy-mode
YouTube trailers and Cloudflare challenges. Navigation to unapproved promotion
routes is rejected; new windows and downloads are blocked. Video/subtitle CDN requests
remain available unless their domain is explicitly blocked.

Rules are packaged from `config/online-filter.json`; after changing them, rebuild
the native executable. Add a script host only after verifying it is a player
dependency. Frame-route changes live in `native/onlinefilter.cpp`. Domain matching
uses exact hostnames or explicit subdomain boundaries, not arbitrary substrings.
This is a focused provider filter, not a complete general-purpose ad blocker:
same-origin advertising and ads included in video content may remain. Provider
changes can require rule updates. The separate browser prototype is not filtered.

### Anime servers

The Servers picker also looks up anime episode mappings in the background. Its
local `/api/anime/resolve/:type/:id` endpoint uses the version-3
[AniBridge mappings](https://github.com/anibridge/anibridge-mappings) dataset to
translate TMDB movies or season/episode pairs to AniList IDs and episode numbers.
It handles parts that restart numbering and noncontiguous ranges. Unmatched,
ambiguous, ID-only, or split/combined episode mappings produce no anime sources;
titles and season numbers are never guessed. Regular servers remain usable if the
lookup fails, and the picker offers Retry anime servers.

Only TMDB-to-AniList mapping text is cached in
`.local/cinepro-ui/data/anime-mappings-v3.json`. It refreshes after 24 hours, reuses
the last cache during an outage and combines simultaneous refresh requests.
Downloads have a timeout and size limit. No AniList account or API key is needed
for this mapping dataset. The local API retains its origin checks and network guard.

Provider integrations: [AniXo](https://anixo.buzz/),
[Cinezo](https://cinezo.live/) and [SupaPlay](https://supaplay.fun/).
Anime matches add separate sub/dub rows; AniXo uses the same native media adapter
and remote controls, with provider caption-menu support and autoplay disabled.
Live AniXo playback of Frieren episode 1 was verified inside Qt on 2026-09-06,
but the 2026-09-07 recheck below failed. The specific HLS and DASH
library paths observed in the players are allowed without permitting arbitrary
CDN scripts. Popups and downloads remain blocked.

Live checks on 2026-09-06 exposed provider-side problems: Cinezo's advertised
AniList route falls through to its demo, and SupaPlay's AniList route returned
Fullmetal Alchemist for a Frieren request. Those anime rows are listed as unavailable
and cannot be selected. Cinezo's TMDB movie/TV route remains selectable, but its
tested episode stalled with upstream CORS errors. Recheck the provider endpoints
before clearing `screeningServerIssue()` in `screening-room.ts`; a documented URL
alone is not proof that it returns the requested episode.

#### WSL playback recheck — 2026-09-07

The isolated Qt desktop check reproduced AniXo API error 521 on Mushoku Tensei
S1E1 sub, Mushoku Tensei S1E2 dub, and Frieren S1E1 sub. All three stayed at zero
playback time with no video dimensions and `readyState=0`. This is a current
provider initialization failure, not evidence of an episode codec failure.
The mapped AniList IDs were 108465 for Mushoku and 154587 for Frieren.
Results: `.local/moviesapi-remote-check-sJ474A/results.json` and `desktop.log`.

The existing VidFast TMDB route played Mushoku S1E1 in the same WSL Qt runtime:
time 5.71 seconds, 1920×1080 video, `readyState=4`, `paused=false`.
This verifies brief video playback, not full-episode continuity or sub/dub
coverage. Results: `.local/moviesapi-remote-check-RqqZbU/results.json`.
Use the regular **VidFast** row in Servers for this tested fallback.
Frieren S1E1 did not start on VidFast even after a separate check allowed 30
seconds after Play: time and video dimensions remained zero, `readyState=0`.
Its failure reason was not established. Results:
`.local/moviesapi-remote-check-Ge7svq/results.json`. VidFast is therefore not a
verified universal anime fallback.

The runtime reports H.264 support but no HEVC support. That remains a separate
limitation; a failed AniXo initialization does not identify the episode's codec.
Mapping unit tests pass, but neither mapping tests nor successful iframe loading
establish provider playback availability. The six anime rows represent only
three providers, and two of those providers' anime routes are already disabled.
Unavailable entries can still receive remote focus to reveal their explanation;
Enter leaves the current player running.

Mapping tests: after building the UI, run `node --test tests/anime-mappings.test.mjs`.

`npm run start:cinepro` still starts the standalone experimental services for
development at **http://localhost:5174**, retaining its multiple-provider behavior.
The Windows launcher leaves errors visible and pauses before closing. Services run
independently of the launcher; repeated and simultaneous launches reuse them.
`Launch CinePro.cmd --check` checks frontend startup without opening a window or pausing.

Logs and PID files: `.local/cinepro-runtime/`. The launcher writes `ui.log` and,
when it starts Core, `core.log`. The already-running Core installation may instead
be logging to `.local/cinepro/local-server.log`. No token is printed by the launcher.

After editing the UI:

```sh
npm run build:cinepro
```

The build command restarts the UI automatically. Upstream Fastify/Vite caches its HTML template. Rebuilding
assets without restarting can leave references to deleted JavaScript bundles.
`npm run restart:cinepro` is also available separately. Restart only targets the recorded UI process after checking its command and
working directory; it does not stop Core or unrelated processes. Reload open tabs.

## Installation and changed files

The configured Core remains at `.local/cinepro`. Its custom `run-local.sh`,
`local-network.mjs`, `.env`, providers, loopback binding and authorization are
preserved. `.env` must contain the existing `LOCAL_API_TOKEN` and
`TMDB_READ_ACCESS_TOKEN`. Keep that file private.

The customized frontend is at `.local/cinepro-ui`, inside the same project root
as Core and the native app. Its upstream changes are also saved in
`patches/cinepro-ui.patch`. `npm run setup:cinepro` builds these existing Core/UI
sources, installs their lockfile dependencies with lifecycle scripts disabled,
and creates the UI `.env` from its template only when absent. It preserves
existing configuration and does not clone or reset another checkout.
Node 22.19+ and npm are required. `.local` is Git-ignored: when transferring the
project, include both source directories and exclude their credentials, runtime
data, dependencies and generated builds.

Files added or changed for this integration:

- Root: both CMD launchers; `scripts/cinepro-{launch,setup,fixtures}.mjs`;
  `package.json`; `README.md`; this document; `patches/cinepro-ui.patch`;
  `playwright.cinepro.config.ts`; the legacy test config (isolated test discovery); `tests/cinepro/`; `tests/cinepro-launch.test.mjs`.
- UI server: `src/server/routes/local-api.ts`, application registration,
  startup error handling and CSP configuration.
- UI client: local TMDB transport; player source mapping/loading/retry/error
  handling; embed player; fullscreen state and settings portal; 4K typography
  scaling; TypeScript configuration and small unused-code cleanup.

The browser uses same-origin `/api/tmdb` and `/api/cinepro` endpoints. Only the
server reads Core credentials. Provider HLS/subtitle URLs become opaque local
media tickets; playlists and their child URLs are rewritten, and video bytes are
streamed without buffering entire files. Core's existing destination guard is
reused. Embed sources use a sandboxed iframe with a source selector.

## Verification

```sh
npm run test:cinepro
npm --prefix .local/cinepro-ui run typecheck
npm --prefix .local/cinepro-ui run build
npm --prefix .local/cinepro run test:providers
```

The browser suite needs Chromium (`npx playwright install chromium`), ffmpeg and
running/reachable metadata services for catalogue checks. Player fixtures are a
locally generated 30-second test pattern, independent of provider availability.
Tests never change Core credentials or provider configuration.

Verified on Ubuntu/WSL with Chromium:

- All five catalogue/settings pages at 1920×1080 and 3840×2160; no horizontal
  page overflow or JavaScript/console errors during those checks.
- Search, movie details, closing overlays, TV details, selecting Season 1 and
  loading its episodes; Discover pagination.
- HLS time advancing, pause, ten-second seek, fullscreen, visible settings inside
  the fullscreen element, playback speed and fullscreen state restoration.
  Headless Chromium's native Escape behavior is inconsistent; the test also
  exercises the browser `exitFullscreen()` event. Physical F11/Escape remains a
  Windows/TV check.
- Empty sources, source-server failure, visible video failure, retry recovery,
  embed rendering and changing sources.
- Local API endpoint/origin restrictions; five simultaneous launcher processes
  reuse the same UI PID and leave it healthy after exiting.
- Windows CMD `--check` returned exit 0 and reused the services.
- Live movie 361743: four sources returned; master/variant playlists and a
  1,343,840-byte segment returned HTTP 200 through the local adapter. Real browser
  playback advanced beyond five seconds at 1280×720 with no page exception.
  This is a short live check, not a whole-film reliability test.

Screenshots are in `.local/screenshots/cinepro-*.png`; failed-test traces are in
`.local/cinepro-test-results`. The final suite contains eight browser tests and
one concurrent-launch test. The 15 retained directory browser tests also pass.
Client/server typechecks and production build pass.
Changed player/transport components pass the existing client ESLint configuration.
The broader player-directory lint still reports the upstream mixed component/hook
export in `providers/MediaWatchProvider.tsx` (`react-refresh/only-export-components`).
There is no root UI ESLint config; invoke `--config src/client/eslint.config.js`
from the UI directory. Production build warns about two chunks over 500 kB.

## Remaining limits

This is CinePro's browser player with online metadata/artwork, now hosted inside
Screening Room. NAS movies still play through Qt/libmpv; MoviesAPI embeds play
through the app's separate QtWebEngine view. The libraries are separate tabs.
Desktop mode now uses arrows to move focus, Enter to activate, and Escape or
BrowserBack to return. Backspace returns unless editing text. Movie/episode rails
reveal focused cards, dialogs retain focus, and Back restores the previous item.
Search includes a QWERTY keyboard, numbers/symbols, case toggle, Delete, Clear and
Results. Physical typing still works. Settings text fields open a keyboard with
Enter; Done saves and Back cancels. Hero autoplay is paused in desktop mode.
The NAS Library link in CinePro returns to the native NAS tab without a WebChannel.

Desktop embeds use the NAS player's visual layout: full-frame video, gradient
overlays, title/year, white icon controls and focus rings, timeline, mute/volume,
and fullscreen. Controls fade after 4.5 seconds while playing and return on input;
paused/loading/error states keep them visible. Arrows follow NAS control order,
Up opens the timeline, Space toggles playback and F toggles fullscreen. On the
volume slider, Up/Down adjusts volume and Left/Right moves between controls.
The app sends commands through the provider's documented postMessage API. Messages
must match both the selected provider origin and the exact iframe window. The iframe
does not take keyboard focus. The CinePro WebEngine view permits media playback
without an iframe click because parent-page remote commands do not transfer user
activation. Play/pause requests retry until acknowledged (up to 20 seconds), with
visible starting/retry feedback and cancellation while starting.
An isolated native stylesheet hides the provider's duplicate control overlay on
MoviesAPI frames only, preserving video, captions and error/loading elements.
Its control selectors may need updating if the provider changes its markup.
VidLink/VidFast use an isolated native HTML-video adapter for Play/Pause, seek and
volume. The adapter accepts only the local parent window/origin and exchanges media
state, never stream URLs or native capabilities. These two providers reject the
HTML iframe sandbox attribute; native navigation, popup/download restrictions,
request filtering and WebChannel isolation still apply. Native controls require
Screening Room's desktop browser profile; the standalone site keeps its own player.
Audio & subtitles opens a remote-friendly track picker (shortcut S). An isolated
native adapter reads provider subtitle/audio radio menus, with HTML video tracks
as a fallback. It activates the provider's selection controls, including Vidstack's
pointerup handler, so its custom caption renderer stays in sync. Off disables
subtitles. The menu refreshes while open, confirms selection from provider state,
reports unconfirmed changes, and restores focus on Back, including in fullscreen.
Server switches clear the old track list. Commands and responses must match the
exact parent/provider origin and window; only currently discovered track IDs are
accepted. Provider markup may change, and some servers expose no selectable audio
or subtitle tracks. The menu reports this instead of inventing language options.
The Quality button shows the selected mode and the current video resolution.
One muted background player checks sources and their exposed quality options.
An option becomes available only after media time and decoded video frames advance;
menu labels, loading screens and audio-only streams do not qualify. Checks are
bounded by timeouts, canceled on navigation, and cached in memory for two minutes.
The menu fills as checks finish. Choosing an available resolution selects its
checked provider immediately; the provider can still require startup buffering.
Check again refreshes the results. Provider menus and links can change; the app
cannot expose renditions a provider does not make selectable or guarantee continued
playback from a previously working link. Verification proves decoding, not title,
audio-language or full-episode correctness. Dub-specific sources are checked
separately from the default/sub sources.
Provider errors and video ads can still appear inside the embed. Trailer controls use YouTube's official iframe
SDK; CSP allows only its bootstrap and player-script paths. Fonts are bundled locally.

Desktop integration checks: `node tests/cinepro-desktop.mjs` after building
`build/native-test` with `SCREENING_ROOM_TESTING=ON`. The test uses a loopback
fixture and an empty temporary NAS, exercises service failure/retry, mouse and
arrow/Enter tab switching, both rail shortcuts and the return-to-NAS link, page
teardown, mode restoration, bridge isolation, and real unmuted media playback
without synthetic user activation.
The browser player suite also verifies that desktop mode defaults to MoviesAPI
and switches servers without any Core requests. Fixtures do not prove live provider playback.
`tests/cinepro/quality.spec.ts` uses real, locally generated 720p/1080p videos to
check decoded resolution discovery, rejection of non-playing advertised qualities,
Auto selection/recovery, fixed resolution behavior, seek/volume restoration, muted
checks, retry, navigation cleanup, delayed provider menus, provider quality changes and menu focus. It injects the same adapter
packaged in `native/quality-adapter.js`; no Lavish run is required.
A Linux Qt check on 2026-09-08 discovered 1080p, 720p and 480p for Mushoku
Tensei S1E1 through VidFast. Selecting 720p produced advancing 1280×720 video;
selecting Auto returned to advancing 1920×1080 video while retaining position.
This was a short playback check with local title metadata, not a full-episode or
Raspberry Pi test. Results: `.local/moviesapi-remote-check-aBJx8j/results.json`.
The checker uses the main player's viewport size so compact provider layouts do
not hide rendition menus or constrain adaptive video selection.
`tests/cinepro/remote.spec.ts` covers remote browsing, scrolling, focus restoration,
search editing and empty results, menus, seasons/episodes, settings, trailers and
MoviesAPI control messages. A separate live Qt check confirmed play, pause and
seeking with the new controls; provider availability can change.
Run `./build/native-test/online-filter-tests` for policy checks covering unknown
scripts/workers, promotion frames, misleading hostnames, allowed movie/episode
routes, media CDNs, subtitles and metadata images. The desktop fixture also checks
that native filtering blocks injected unapproved requests while local scripts load.

No Raspberry Pi was connected for this work. Pi decoding, 4K video, audio output,
HDR, remote input and prolonged playback still require device testing. Provider
availability, iframe restrictions and interruptions can vary. The interface
provides retries and source switching; it cannot guarantee third-party uptime.

`npm audit --omit=dev` reported 19 upstream dependency advisories (12 high,
6 moderate, 1 low), including Fastify static serving and build-tool dependencies.
No automatic major-version upgrades were applied. This prototype remains bound
to loopback and has not been approved as a public/LAN server.


## Additional anime fallbacks (2026-09-09)

The Servers picker includes AniLink (`anilink.cc`), TryEmbed (`tryembed.us.cc`),
CineXtream (`cinextream.cc`), Nontongo (`nontongo.win`), and 4Animo
(`cdn.4animo.xyz`). Their embed routes use the existing AniList and absolute
episode mapping. AniLink, TryEmbed, CineXtream, and 4Animo have separate sub/dub
routes. Nontongo exposes one provider-selected audio route and is not offered as
a guaranteed dub.

TryEmbed sub is eligible for Auto's normal per-episode decode checks. The other
new variants remain selectable under Servers, labeled **Manual fallback**, and
are excluded from background quality scans. No provider is selected by Auto
merely because it advertises a resolution.

Live checks used Tomb Raider King, AniList 184356, episode 9. TryEmbed sub decoded
720p and 1080p in the desktop Qt player; pause, seek to 10 seconds, and volume 35%
worked through the isolated native adapter. This sample did not expose subtitle
tracks through the native track API. The other providers did not produce advancing
video in the bounded native check: AniLink's browser lookup returned 403,
CineXtream returned an upstream 502, 4Animo's media request returned 403, and
Nontongo did not reach playable video. Availability can vary by episode and date;
these results do not establish Raspberry Pi performance or full-episode correctness.

Native filtering permits only their expected anime frame paths and exact observed
third-party player-library paths (Video.js, its HLS plugin, pinned React modules,
jQuery, and JW Player components). Advertising and arbitrary CDN scripts remain
blocked. Provider pages retain no native WebChannel access.

Verification: `node --test tests/screening-anime-sources.test.mjs`, CinePro
`typecheck` and `build`, `online-filter-tests`, and the anime-provider and quality
Playwright suites. Live artifacts are under `.local/yomi-providers/`.


## TV browsing controls (2026-09-14)

Screening Room mode uses a labeled TV navigation bar and larger controls. Arrow
keys move between controls; OK opens the focused item; Back closes the current
menu/details view before returning to the previous page. Down from the header
enters the page controls predictably. Search retains its on-screen keyboard.

Movie/show rails show five larger posters at TV widths, with titles always
visible. Left/Right moves through the rail and scrolls it; Up/Down leaves the row.
Rows remember their focused item, and closing details restores the exact card,
including when the same title appears in multiple rails. Featured titles use
Previous/Next buttons instead of small dots. Discover provides direct content-type
buttons and a directional grid. TV details use a single scrolling episode list;
season selection, cast, and recommendations are reachable with the remote.

Focused regression check:

```sh
npx playwright test --config playwright.cinepro.config.ts tests/cinepro/tv-browsing.spec.ts
```

These seven deterministic browser tests cover 1280×720, 1920×1080 and 3840×2160,
header navigation, hero selection, rail scrolling, details restoration, episode
lists, season/filter menus, search and settings. They verify keyboard interaction
and layout, not live provider playback or physical remote hardware. Existing
`remote.spec.ts` and `quality-fixtures.ts` contain incomplete code from before this
change; the new suite runs independently of those files.
