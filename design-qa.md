# Directory reference update — September 6, 2026

final result: passed

## Source and comparison

Target: user Image #1, 1672×941 pixels, at
`local reference image (not published)`.
Final browser capture: `.local/screenshots/directory-reference.png`, same
1672×941 viewport, device scale factor 1. Both images were opened together in
one comparison input. Text and controls are readable at this size; additional
region crops were unnecessary.

The comparison fixture uses the two actual Top Gun entries, the theater edition
selected, Search focused, and 24 minutes remaining. Temporary fixture paths put
the editions in the reference order; no real catalog, watch history, or files
were modified. Production still sorts duplicate titles deterministically.

## Findings and fixes

- P1, initial banner: center cropping removed the top of the subject's face.
  Changed the image to top-aligned cover; the paired final capture shows the
  entire face inside the angled banner.
- P2, initial details: text/progress extended too far right. Increased the right
  inset and adjusted synopsis type size. The final text/progress bounds align
  near x=756–1522, with actions and the footer in their reference positions.
- P2, initial list: selected row sat too low. Reduced the letter heading height;
  final selection begins near y=507 versus y=505 in the supplied image.
- Navigation regression: Left now enters the new alphabet rail. Updated the
  old navigation expectation and added a real keyboard traversal test covering
  group activation, unavailable letters, and returning to the selected row.

No remaining actionable P0/P1/P2 findings in the final paired comparison.

## Required fidelity surfaces

- Typography: bundled Fraunces 600 display title and Nunito Sans body text;
  large pale initial, letter-spaced heading, larger selected row. Long titles
  clamp to two lines, rows ellipsize, complete titles remain in Movie options.
- Layout: logical 1920×1080 canvas, 112px rail, 604px directory, edge-to-edge
  detail pane; selected row extends 90px into its neighbor. Only the directory
  scrolls. Hero angles, content insets, button sizes and footer checked visually.
- Colors: navy text, pale blue rail/list, warm off-white details, cobalt blue
  selected row/actions, distinct keyboard focus. Flat surfaces replace the
  mockup's subtle atmospheric shading (P3 polish difference).
- Images: actual linked TMDB backdrop, with no new persistent artwork cache.
  It is the same subject/scene but not the enhanced raster in the reference.
  Existing poster/video-frame fallbacks remain. Image loaded at 1280px source
  width in the verified browser capture, without a broken-image state.
- Copy/content: actual metadata and watch progress. Complete A–Z rail corrects
  duplicate/missing letters in the image. Progress accurately shows roughly
  80% watched when 24 minutes remain, rather than copying the inconsistent
  decorative segments. Film-strip library icon differs from the reference's
  reel icon (P3); both identify the film collection.

## Interaction and display checks

All 18 browser tests pass: alphabet jump, selected detail updates, scrolling,
search/remote keyboard, progress, options/dialog focus, metadata/artwork
fallbacks, library failures, refresh, and scaled displays including 4K and
portrait letterboxing. The reference capture reported no page errors.
Frontend/native production build passes. The headless native integration run
stalled after audio switching (`.local/playback-test-zip2CX`); this does not
invalidate the visual comparison, but remains a separate playback limitation.
The visible WSLg run also stalled at the same audio-switch/resume step
(`.local/playback-test-JjhOVo`). A debugger captured the mpv audio thread waiting
in `pa_threaded_mainloop_wait`, while the UI waited on an mpv property query.
Native audio switching remains unresolved; no player source was changed in this
UI update. Visual/UI QA passes; the full native playback regression does not.

Previous design report: `docs/design-qa-previous-directory.md`.

## Alphabet alignment and motion follow-up

Fixed the selected letter changing the height of the rail's flex layout.
All 27 slots now keep their positions; one independent circular indicator moves
between their centers. Movie rows likewise retain the same height when selected.
Added short, interruptible rail/row transitions, a 180 ms details entrance,
and an artwork fade. Reduced motion disables these effects. The refreshed
`directory-reference.png` was inspected for circle/text alignment.
All 20 UI checks pass (19 in the full run, then the reduced-motion test after
correcting its initial-focus readiness wait). The new geometry test verifies
unchanged letter positions/row heights and the indicator's final center.
Native production build passes. The previously recorded audio-switch issue
was not changed or retested by this scoped interface update.

## Search reference redesign

final result: passed

Source: user search Image #1,
`local reference image (not published)`.
Final capture: `.local/screenshots/search-reference.png`. Both images were opened
together in a single comparison input at 1672×941, device scale factor 1, with
query TOP, the P key focused and the first of two Top Gun results selected.
The capture fixture does not change the saved catalog. Full-size text and
controls are readable; separate crops were not required.

Initial P2 differences: search field lacked its editing outline when a key had
focus, result text sat too far left, keyboard sat slightly low, and footer hints
were too tightly grouped. Corrected insets, persistent search outline, row gaps,
title size and footer spacing; inspected the revised paired capture. No remaining
actionable P0/P1/P2 differences.

Fidelity surfaces:
- Typography: bundled Nunito Sans keys/results, Fraunces result count; long result
  titles wrap to two lines, metadata remains legible.
- Layout: 112px rail, 680px editor, angled 458px hero, three QWERTY rows and
  Space/Clear/Done controls, thumbnail results, bottom remote hints.
- Colors: inherited pale blue/navy/warm-white palette; cobalt key and result
  selection. Reduced motion suppresses key/result transitions.
- Imagery: real linked TMDB artwork with lazy thumbnails and existing fallback.
  Both editions share the same TMDB backdrop; the reference's alternate still
  was not fabricated. The original raster's pale atmospheric image treatment
  and reel icon remain acceptable P3 differences.
- Content/behavior: live result counts, QWERTY plus numbers/symbols, cursor-aware
  insertion/deletion, empty state, Done focus transfer and return-to-keyboard
  navigation. Choosing a result retains the existing return-to-details behavior.
  Caret appears only when the real input is focused, rather than duplicating a
  decorative caret while P is focused.

All 22 browser checks pass, including keyboard cursor edits, numbers, Delete,
Clear, Done, empty results, selected hero updates, return focus, 4K/letterboxed
layouts and the earlier directory regressions. The visual capture reported no
page errors. Frontend and native production builds pass; player source unchanged.

## Search keyboard follow-up

Reproduced focus errors using actual browser key events: Up from Q entered the
alphabet rail, Right from Delete jumped to P, and Down from the action row
entered the rail. Physical typing with a key focused dropped letters and Space
activated that key again. Added failing regressions before correcting these.

Keyboard arrows now follow explicit rows, preserve the horizontal column across
wide action keys, return to the input above the top row, and stop at the bottom
and left edges. Right at a row's end enters results when available; Left from
results restores the keyboard key. Disabled Done is skipped. Physical character
typing restores input focus. Also reproduced and fixed an unchanged-text
replacement leaving the selection active instead of advancing the cursor.

Validation: all 26 Playwright browser checks pass, including a complete
arrow/Enter-only TOP search, Delete, Done, result selection, mixed physical and
on-screen typing, empty results, and cursor replacement. The production frontend
and native executable rebuild successfully; `git diff --check` passes. Testing
covered browser keyboard events; native OS input delivery was not retested.

## CinePro desktop tab integration

Implemented native NAS Library/CinePro tabs in the same Screening Room window.
The CinePro tab reuses the existing frontend and selects MoviesAPI exclusively;
no external browser is opened. A separate WebEngine view has no native player
bridge and is destroyed when returning to NAS. On-demand frontend startup,
loading/error/retry states and keyboard tab selection are implemented.

The native check found and corrected Enter activation and tab-bar stacking.
Live Wayland inspection found Qt's `en-POSIX` locale becoming an invalid TMDB
region. Region parsing now accepts only two-letter codes, and a finished empty
hero no longer displays an endless loading message. Actual catalogue artwork
loaded in the native view with no WebChannel exposed to it. Native screenshots:
`.local/cinepro-live-BmfJ4E/cinepro-tab.png` (Home and the app tab bar),
`.local/cinepro-live-5INl8W/cinepro-tab.png` (TV catalogue after locale correction).

Validation: 26 NAS browser tests, all 10 CinePro browser tests, and the native
desktop fixture pass. The native fixture checks offline retry, mouse and keyboard
tab switching, page destruction, browsing-mode restoration, and bridge isolation.
Both native builds and CinePro frontend/server builds and type checks pass.
The reproducible CinePro patch is updated and reverse-checked. Live MoviesAPI
film playback and custom playback commands were not validated in this frontend
pass; provider controls remain inside the embed.

## MoviesAPI request filtering

Added a dedicated filtered QtWebEngine profile for CinePro. New script/worker hosts
are denied by default; approved player assets, metadata, subtitles and changing
HTTPS media CDNs remain available. Frame navigation is restricted to approved
movie/episode, trailer and challenge routes. Rejected frame navigations leave the
current document in place. Known unwanted domains are blocked for all resource
types, with hostname-boundary matching. Online downloads are cancelled.

Validation: all five Qt filter-test results pass (three policy scenarios plus
setup/cleanup); the native desktop fixture confirms blocked requests and working
local scripts alongside the existing tab/retry checks. Production and test native
builds pass. A live native MoviesAPI check for TMDB 533533 reached 3.11 seconds,
readyState 4, paused=false, no media error, with 21 unapproved requests blocked.
Report: `.local/moviesapi-filter-check-BEtDvD/result.json`. Earlier automated
inspection attempts timed out because Qt exposes the cross-origin player in a
separate debugger target; attaching to that target resolved the inspection.

The exact extension promotion in the user's screenshot was not reproduced in
these sessions. This is a focused script/frame filter, not a guarantee against
all ads: inline/same-origin ads or advertisements in video content may remain.
The rules are in `config/online-filter.json`; rebuild after verified rule changes.

## CinePro remote navigation — 2026-09-06

Desktop mode now uses the NAS arrow/Enter/Back pattern, visible blue focus,
focusable movie and episode cards, automatic carousel reveal, scoped dialog/menu
navigation and focus restoration after closing details or returning from playback.
Search has a QWERTY keyboard with numbers/symbols, case toggle, cursor editing,
Delete/Clear and result navigation. Settings retain their native menu/tab behavior
and editable text fields have an on-screen keyboard. The NAS Library header link
returns to the native tab without granting the online view a WebChannel.

MoviesAPI playback has app-owned controls using the documented postMessage API,
validated by both event origin and iframe window. The provider iframe is inert to
keep remote focus in app controls. Subtitle and quality menus remain unsupported
by this remote interface. Trailers use YouTube's iframe SDK with narrowly scoped
CSP script paths; blocked/unavailable trailers retain Back and a visible error.

Validation: client/server typecheck and production build passed. All 17 CinePro
browser tests passed, including seven new remote flow tests. Native desktop
fixture passed, including the NAS return link. The original live Qt check used
synthetic iframe user activation during inspection, which masked the playback
permission defect subsequently reported by the user. That earlier report was:
`.local/moviesapi-remote-check-5NM9CG/result.json`.
Native fixture artifacts: `.local/cinepro-desktop-vtyLGc`.
Search visual: `.local/screenshots/cinepro-remote-search.png` (result text was
subsequently enlarged). The reproducible UI patch passes reverse-apply checks.
Physical Raspberry Pi remotes/CEC and long playback sessions were not tested.

## CinePro Play fix — 2026-09-06

Reproduced `NotAllowedError: play() can only be initiated by a user gesture`
inside MoviesAPI with both activation flags false. Parent-page Enter/postMessage
does not activate the provider document. Disabled the gesture requirement in the
dedicated CinePro WebEngine view. Explicit play/pause requests now retry for up to
20 seconds until acknowledged, with starting/cancel/retry feedback; retries never
toggle an already-playing video back to pause.

The hidden native live check then passed Enter to play/pause and Right/Enter to
seek, with both initial activation flags false and no synthetic CDP activation.
Result: 13.44 seconds after seeking, paused=true, muted=false, no media error,
21 blocked requests. Report: `.local/moviesapi-remote-check-iA0g03/result.json`.
Native fixture also passed a new real unmuted WAV playback assertion without user
activation: `.local/cinepro-desktop-5Xcjos`. Native builds, CinePro typecheck and
production build passed. All 19 CinePro browser tests passed. Regression cases cover delayed provider startup,
cancelling pending Play, and a provider that never acknowledges the request.

## CinePro NAS-style player — 2026-09-06

Matched `native/PlaybackControls.qml`: full-frame video, gradient overlays,
title/year/episode header, paused indicator, white icon buttons and focus ring,
timeline, elapsed/total time, mute/volume and fullscreen. Remote order and
Space/F shortcuts match NAS. Controls fade after 4.5 seconds while playing;
arrows wake them and restore usable focus. Paused/loading/error states stay visible.
The unavailable Audio & subtitles control is disabled. Removed the extra page Back
button. Existing provider-origin/window validation and Play retry handling remain.

An ApplicationWorld script on the isolated native browser profile hides only
MoviesAPI's duplicate Vidstack control group. Video, captions and errors remain.
Page-level script injection did not reach the cross-origin frame in the installed
Qt version; profile-level injection was verified in the live frame. Provider class
prefixes can change and will require maintenance.

Validation: all 20 CinePro browser cases passed (19 on the initial run, the catalogue
case on isolated retry after concurrent native/browser traffic hit the local rate
limit). Tests cover NAS control order, mute/unmute, volume arrows, fullscreen/Back,
timeline focus, auto-hide/wake and layouts at 1920, 1280 and 720 pixels wide.
Screenshots: `.local/screenshots/cinepro-nas-player-{1920,1280,720}.png`.
Client/server typecheck, production UI/native builds and patch reverse-check pass.
Live native Play/Pause/seek passed without synthetic user activation; the provider
control group computed `display: none`, video stayed visible, and no media error
was reported. Report and screenshot:
`.local/moviesapi-remote-check-kAZLib/` (13 seconds after seeking, paused, unmuted).

## Player server picker — 2026-09-06

Added a Servers button beside the playback controls with MoviesAPI (default),
VidLink and VidFast. The dialog shows the current server, supports arrows/Enter/
Back, remains inside fullscreen, and restores focus on close. Switching replaces
the iframe, stops the old session, resets playback state and retains movie/TV
season/episode IDs. Listings are documented embed addresses, not availability
checks; switching can restart playback. Loading/Play timeouts leave the picker
available. A media element with no metadata cannot acknowledge successful Play.

The native request policy now allows only the three exact provider hosts and
documented movie/episode frame paths. VidLink and VidFast use an isolated native
HTML-video adapter with parent-window/origin checks and a small media-command
allowlist. No media URLs, filesystem capabilities or WebChannel are exposed.
These providers reject HTML iframe sandboxing, so that attribute is omitted for
them; Qt still blocks popups, downloads, external top-level navigation and
unapproved scripts/frames. VidLink's original control overlay is hidden by its
observed CSS-module prefix. Provider markup and overlays can change.

Validation: UI typecheck/build and native builds pass. All 23 browser cases passed;
the final readiness change was followed by focused movie/episode/fullscreen and
failed-server recovery checks. Qt policy tests: five results passed. Native
integration fixture: `.local/cinepro-desktop-9jF4a7`. The UI patch reverse-checks.
Live VidFast playback reached 12.96 seconds while playing:
`.local/moviesapi-remote-check-Lj4aXB/VidFast.png`. VidLink loaded its video element
but the tested movie remained at zero without metadata, so its playback is not
verified. Do not report all listed servers as working copies of a title.
Server picker screenshots: `.local/screenshots/cinepro-servers-movie.png` and
`.local/screenshots/cinepro-servers-tv.png`.

## Audio and subtitle picker — 2026-09-06

Enabled the Audio & subtitles button and S shortcut. The fullscreen-contained
dialog supports arrows, Enter and Back, displays actual track selection and an
Off option, and restores button focus on close. Lists refresh only while open;
server changes discard previous tracks. Missing tracks and unconfirmed changes
have explicit messages. Alternate audio depends on what the provider exposes.

The native ApplicationWorld adapter validates the local parent origin/window,
discovers provider radio options or native media tracks, and accepts only IDs
from its current list. It uses pointerup plus click to support Vidstack's radio
controls and conventional controls. Plain click did not change the live Vidstack
selection; the corrected action was verified against provider state. Duplicate
React keys for the iframe and track dialog were also caught by the server-switch
regression and corrected, retaining a single provider frame.

Live MoviesAPI check: 37 subtitle languages, no alternate audio tracks for the
tested movie. Spanish → Off → English were confirmed both in the app and the
provider's own radio state; Back restored focus, and playback advanced afterward.
This verifies track selection, not the accuracy or timing of every subtitle file.
Artifacts: `.local/moviesapi-remote-check-xxCltm/tracks.png`.
Native integration passed: `.local/cinepro-desktop-NFYwhl/`.
UI typecheck/build, both native builds and patch reverse-check passed.
The browser track regressions exercise pointerup-only provider radios, alternate
audio, native subtitle fallback, Off, forged-response rejection, fullscreen Back
and clearing stale tracks on server switch.
All 25 CinePro browser tests passed in the final run.

## Anime provider integrations — 2026-09-06

Added Cinezo's TMDB movie/TV routes and AniList-based sub/dub source builders for
AniXo, Cinezo and SupaPlay. A background lookup resolves the selected TMDB episode
using the AniBridge v3 graph, including season parts that reset episode numbering.
Only unambiguous one-to-one episode mappings are used. The local server stores a
compact text cache, refreshes daily, combines concurrent requests and uses stale
data during outages. A failed lookup leaves regular servers usable and provides
a retry action. No extra account or API key was added.

New provider origins and exact frame paths are covered by the native policy. The
observed jsDelivr HLS/DASH library paths are permitted; arbitrary CDN scripts are
still rejected. AniXo's duplicate controls are hidden, caption selection uses its
own menu actions, and autoplay is disabled to match remote Play behavior. Native
Play retries survive AbortError while a provider replaces its initial source.

Live results:
- AniXo played the mapped Frieren episode 1 in Qt, reaching 2.10 seconds with
  `paused=false`, `readyState=4`. Artifact:
  `.local/moviesapi-remote-check-pmYhxQ/anixo.buzz.png`.
- Cinezo's normal TV route loaded but stalled with upstream CORS errors. Its
  documented AniList route falls through to a demo page (the served bundle has
  movie/TV routes but no anime route).
- SupaPlay's documented AniList route for Frieren displayed Fullmetal Alchemist
  and a different episode source. Its route is not safe to treat as a title match.
- Cinezo anime and SupaPlay anime entries are retained with explicit unavailable
  messages. They can receive remote focus so the reason is readable; Enter does
  not replace the current frame. Provider endpoint issues must be rechecked before
  removing these flags. This is not a claim that all three providers play correctly.

Native integration: `.local/cinepro-desktop-Yvb5Ou/`. Mapping unit checks and the
five Qt policy results passed. UI typecheck, client/server builds, both native
builds and patch reverse-check passed. Browser coverage includes mapped ID and
episode URLs, sub/dub choices, remote fullscreen switching, failed lookup retry,
unavailable entries, AniXo startup interruption and provider caption menus.
All 28 browser tests passed in the final run. The server picker screenshot is
`.local/screenshots/cinepro-anime-servers.png`.


## Web phone remote — 2026-09-09

- Added the native NAS Library phone dialog with locally generated QR codes and selectable receiver addresses.
- Verified the phone trackpad, all four swipe directions, tap/keyboard selection, cancellation, Home shortcuts, Back, failure and reconnect behavior with Playwright. Checked 320px, 390px and landscape layouts.
- Frontend build and native build passed; 28 browser tests and 11 receiver tests passed. The browser remote integration drove real Qt/WebEngine NAS navigation and playback, Home, and isolated CinePro controls.
- Native screenshots: `.local/network-remote-test-efpFpM/phone-remote-qr.png` and `phone-remote.png`. Mobile screenshots: `.local/screenshots/remote-320.png`, `remote-390.png`, `remote-844.png`.
- Lavish was attempted, including a retry without proxy environment variables. It reported “Lavish Editor server did not start”; direct startup reported port 4387 already in use. Used Playwright interaction checks and visual screenshot inspection instead.
- Physical phone scanning and Raspberry Pi deployment were not performed in this change.


## Visible QR and volume slider — 2026-09-09

- Moved the phone remote entry from the sidebar to an always-visible QR card in the NAS Library’s top-right corner. Clicking it enlarges the QR and offers alternate addresses.
- Added a 0–100% volume slider with native and CinePro state synchronization and unavailable/offline handling.
- Frontend and native builds passed. All 28 browser tests, 11 receiver tests, and the real desktop browser-remote integration passed, including absolute volume changes for NAS and CinePro.
- Inspected native QR placement and phone screenshots in `.local/network-remote-test-EMNcov/` and `.local/screenshots/`.
- Lavish opened successfully on this pass; the user approved the review (“yup this is good please close out”). Closed the review session as requested.


## Phone system keyboard — 2026-09-09

- Added a Keyboard button that opens TV search and synchronously focuses a standard text input, allowing the phone’s system keyboard to open. No custom TV-style keyboard is rendered on the phone.
- Send text supports Unicode and URL punctuation, with Delete and Enter controls. Drafts survive failed sends, IME composition is not submitted prematurely, and browser text commands retain origin and input validation.
- Three focused browser tests, 11 receiver tests, frontend/native builds, and the actual desktop browser-remote integration passed. The integration typed Chinese text into NAS search and deleted through the phone controls.
- Lavish preview rendered successfully; no layout warnings were reported during the check. Inspected `.local/screenshots/remote-keyboard.png`. A physical iPhone keyboard was not exercised in the headless browser.


## Yomi-listed anime providers — 2026-09-09

- Added AniLink, TryEmbed, CineXtream, Nontongo, and 4Animo to CinePro's mapped anime sources. Nontongo has one provider-audio route; no invented dub variant.
- TryEmbed sub passed native decode (720p/1080p), pause, 10-second seek, and 35% volume checks. Auto still requires per-episode frame advancement. Other new variants remain labeled manual fallbacks and excluded from Auto scans after unsuccessful live tests.
- Extended exact native frame paths and observed versioned script dependencies. Generic CDN code, promotion frames, and unknown hosts remain filtered. Extended both isolated control/track adapters and the quality adapter.
- Source tests (2), anime provider UI/track tests (5), quality regression tests (5), and native filter checks passed. CinePro typecheck, client/server builds, native executable build, and saved patch reverse-check passed.
- Live results: `.local/yomi-providers/`; successful native control inspection: `.local/yomi-providers/native-vBJQr2/`. The tested TryEmbed sample did not expose native subtitle tracks. Physical Pi testing was not performed.
- Reviewed the real server-picker screenshot; Lavish review uses CinePro's existing dark styling and actual captured UI.
