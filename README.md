# Screening Room

The Linux/Raspberry Pi application has one source directory on this PC:
`/path/to/home_nas_stream`. The Raspberry Pi deployment is a separate running
installation; local cleanup does not update or remove it.

See the [repository map](docs/repository-map.md) for source locations, provider
configuration, local CinePro checkout requirements, and focused tests.

Pi installation, startup, NAS setup and build instructions are in
[the Raspberry Pi guide](docs/raspberry-pi.md). Run `bash install-pi.sh` on the Pi
for installation, or `npm run build:pi` for a full source build.

Double-click `Launch Screening Room.cmd` or run `npm start` to open the native
movie directory and libmpv player. Select a movie to enter playback.

The desktop window has **NAS Library** and **CinePro** views. CinePro uses the
existing online browsing interface with movie, TV, and anime server choices.
Its local frontend starts automatically when the tab opens. `Launch CinePro.cmd`
opens Screening Room directly on that tab; neither CMD launcher opens a browser.
Use the CinePro logo in the NAS sidebar and CinePro's NAS Library link to switch
views, or press Ctrl+1/Ctrl+2. F6 focuses the current view. Leaving CinePro
closes its playback page and returns to the NAS library. See [CINEPRO.md](CINEPRO.md).

## TV media directory

An unbranded alphabetical movie directory and native player: React/TypeScript inside Qt WebEngine,
with libmpv video and native Qt playback controls. Movie files remain in your
movie folder. SQLite stores file metadata, TMDB text, image URLs, and watch progress
on this device. Movie artwork is not saved to disk: TMDB images load by URL and
fallback video frames stay in memory.

## Develop and run

Develop the Linux application here in Ubuntu/WSL; deploy this same source tree
to Raspberry Pi OS. WSLg displays the Linux application on the PC desktop.
The two CMD shortcuts are WSL wrappers, not a separate Windows build.

Install system dependencies on Ubuntu (as an administrator):

```sh
sudo apt-get install cmake ninja-build qt6-base-dev qt6-declarative-dev \
  qt6-webengine-dev qt6-websockets-dev libmpv-dev ffmpeg qml6-module-qtquick \
  qml6-module-qtquick-window qml6-module-qtqml-workerscript \
  qml6-module-qtwebengine qml6-module-qtwebchannel qml6-module-qtquick-controls \
  qml6-module-qtquick-layouts libqt6sql6-sqlite qt6-svg-plugins
```

Build and start:

The Screening Room CMD launcher opens the Linux application through WSL.

```sh
npm ci
npm run build:native
npm run start:directory
```

`npm run start:directory` uses `/mnt/movies`, or `/mnt/movies` when running
under WSL with that folder present. Data and metadata configuration live in
`.local/`. Set `SCREENING_ROOM_LIBRARY_DIR` to override the movie folder.
For another folder or a mounted NAS:

```sh
./build/screening-room --library /mnt/movies --data-dir .local --fullscreen
```

The native app scans supported video files recursively and probes duration and
video format with FFprobe. Unchanged file metadata is cached. Filesystem scanning
and probing remain synchronous, so large libraries need background indexing next.
TMDB lookups and on-demand FFmpeg thumbnails run asynchronously after the scan.

The frontend is embedded in the executable. Run `npm run build:native` again
after changing the React interface. Fonts are bundled. Online access is used for
TMDB matching and linked artwork; cached text and local playback also work offline.

## TMDB metadata and artwork

All streaming providers and API credentials share one private file:
`.local/stream-providers.env`. Initialize it with `npm run configure:streams -- --init`,
then edit it and run `npm run configure:streams`. Provider URL changes require a
rebuild; credential changes require restarting the services. The native backend
also accepts `TMDB_READ_ACCESS_TOKEN` from its environment. Credentials stay on
the backend. See [stream configuration](docs/stream-configuration.md) and
[source packaging](docs/source-packaging.md) for fresh-clone setup.
Use `--offline` to disable lookups while retaining cached metadata.

After discovery, the backend searches by cleaned filename title and year, retries
without the year, then tries the containing folder's name. Only a unique exact
normalized title/original-title match is accepted, with year equality when supplied.
Ambiguous, missing, or failed results keep the original filename-derived title.
This is conservative matching, not a guarantee of correct identification.

Matched records store the TMDB ID, official title/year, synopsis, genres, and
poster/backdrop URLs in the local `tmdb_metadata` SQLite table. Actual file
duration, codecs, paths, identities, and watch progress remain separate. Existing
matches are reused on subsequent scans; a changed file stamp invalidates the match.
Unmatched lookups can retry on a scan after seven days; network/API errors after
five minutes. A failed API request stops the batch, keeping local playback available.
`--scan-only` waits for its metadata batch before writing its JSON result.

The UI tries the backdrop URL, then poster URL, then an FFmpeg frame from the file.
Frames are generated on demand and kept in a bounded 16 MiB memory cache. No new
movie image files or image bytes are written to SQLite or `library.json`. Old
`artwork/` files from earlier versions are left untouched but no longer used.
Qt WebEngine uses an off-the-record profile and memory HTTP cache. Remote artwork
is restricted to TMDB's image host; browser-preview caching follows the browser's
own settings. Without a working image connection, the local frame is the fallback.
Metadata credits are shown in Movie options for matched movies.

## Browser development

After the native application has scanned the library:

```sh
npm run dev
```

Open <http://localhost:5173>. Vite provides hot reload and serves the generated
`.local/library.json` and artwork. The browser preview supports browsing,
searching, and details. Playback requires the native application; the preview
does not simulate successful playback.

## Directory interface

Home follows the updated September 6 image reference: a pale alphabet rail,
scrolling A–Z list with a blue selection extending into the details pane,
angled full-width artwork, and a stationary movie details/progress panel.
The rail jumps to available title groups; its film button refreshes the library.
Non A–Z titles appear in a final `#`
group. Duplicate titles retain separate IDs, source paths, and watch progress.
The UI uses a logical 1920×1080 canvas, proportionally scaled and centered in
the output; 3840×2160 uses a 2× scale. Smaller/non-TV windows are letterboxed.
Fraunces SemiBold and Nunito Sans are bundled locally with the frontend.
Alphabet slots and movie row heights remain fixed as selection changes. The
circle moves over the rail in 180 ms, rows transition in 160 ms, and details
and newly selected artwork fade in briefly. Reduced-motion preferences disable
these effects; navigation never waits for an animation to finish.

`src/screens/DirectoryScreen.tsx` coordinates the screen. Presentation lives in
`src/components/`; library loading, ID selection, and remote focus/navigation
live in focused `src/hooks/`. Shared media formatting/grouping is in
`src/media.ts`, and visual tokens are in `src/tokens.css`. The existing Qt
WebChannel bridge remains the playback boundary. React renders no video.

Search uses the updated split layout with a QWERTY keyboard, selected-result
hero artwork, and thumbnail rows. The arrow key on the on-screen keyboard
toggles numbers/symbols; Delete edits at the cursor, Space inserts a space,
Clear resets the query, and Done moves focus to the selected result. Up/Down
browse results and update the hero; Left returns to the last keyboard control.
Down from the search field enters the keyboard at Q (or the last used key).
Left/Right follow the current row; Right at its end moves to results when
available. Up/Down follow adjacent rows and retain the original column across
the wider action buttons. Up from the top row returns to the text field.
Typing letters on a physical keyboard resumes text entry even after using an
on-screen key; Enter/Space still activate focused buttons.
Choosing a result opens its movie details. Thumbnails load as they approach the
visible list, using the existing linked artwork/video-frame fallback.
Movie options
exposes file details, playback, and restart when there is saved progress. The
existing model contains movies only, so no fictional series/episode data is
introduced. Missing synopsis, year, runtime, and artwork have explicit fallbacks.
Artwork URLs must be local, from the app's own origin, or HTTPS URLs under
`image.tmdb.org/t/p/`. No external fonts are fetched at runtime.

Library loading, an empty library, unavailable NAS, and playback failures have
separate states. Refresh preserves the selected ID if still present and chooses
the first title if it was removed. Native refresh errors update library state;
playback errors return to the directory with a dismissible dialog.

## Controls

| Control                            | Action                                       |
| ---------------------------------- | -------------------------------------------- |
| Up / Down in directory             | Select movie; held keys repeat through rows   |
| Up from first movie                | Focus Search                                 |
| Left from movie                    | Focus alphabet rail                          |
| Up / Down then Enter on rail       | Choose an available letter and jump to it    |
| Right from rail                    | Return to selected movie                     |
| Right from movie / Left from action| Enter actions / return to selected row       |
| Enter on movie                     | Play or resume through the native player     |
| Escape / Backspace in directory    | Close search/options; restore movie focus    |
| Tab / Shift+Tab                    | Cycle visible controls within the app        |
| Space during playback              | Play / pause                                 |
| Left / Right on playback buttons   | Move remote focus between controls           |
| Up from playback buttons          | Focus the timeline                           |
| Left / Right on timeline          | Seek backward / forward 10 seconds           |
| Down from timeline                | Focus Play / Pause                           |
| Enter / OK on playback controls   | Activate the highlighted control             |
| Up / Down on volume slider        | Adjust volume in 5% steps                    |
| Up / Down in audio/subtitle menu  | Choose a track; OK selects it                 |
| Escape / Backspace during playback | Save progress and return to collection       |
| F during playback                  | Toggle full-screen                           |
| Seek slider / skip buttons         | Seek or jump 10 seconds                      |
| Audio and subtitles button         | Select embedded tracks or turn subtitles off |

The native overlay uses white icon controls and transparent gradients, with large
remote focus targets. Controls hide after 4.5 seconds while playing and return on
pointer movement or keyboard input. The audio/subtitle menu keeps focus on the
selected track; closing it restores focus to its toolbar button. Muting preserves
the previous volume for unmute.
Progress is saved every five seconds and when leaving playback. Movies within
30 seconds of the end start from the beginning when played again. Subtitles
burned into the video cannot be switched off.

## Verification

```sh
npm run build
npm test
```

The 16 browser tests use deterministic libraries plus the actual local index
when available. They cover sorting and `#` grouping, duplicate/long titles,
remote navigation and held keys, fixed-pane scrolling, search, dialog focus,
loading/empty/disconnected states, refresh/recovery, missing/external artwork,
and the native-playback boundary. Screenshots include 1920×1080 and 3840×2160,
plus smaller window sizes, under `.local/screenshots/`.

Formatting check (there is no separate ESLint configuration):

```sh
npx prettier --check src tests/library.spec.ts tests/native-smoke.mjs
```

Local screenshot comparison: [design-qa.md](design-qa.md).
Implementation file inventory and remaining device checks:
[docs/implementation-verification.md](docs/implementation-verification.md).

For native integration checks, build the app and run:

```sh
npm run build:native
npm run test:native
```

The native check first runs metadata tests covering conservative matching,
year/folder retries, failures, persistent cache reuse, progress preservation, and
thumbnail generation without image files. It then builds a separate executable in `build/native-test` with Qt's
input-testing library enabled, generates a two-minute movie with two audio
tracks and a subtitle track, then launches two successive test instances to verify saved
progress survives a restart. It drives the React directory and actual Qt
playback controls, checking mouse/keyboard seeking, pause, volume, track
selection, fullscreen, and return to the directory against mpv state. It also checks restored Play
focus and recovery from a missing native movie.
Seek regression checks verify one command per timeline release, coalescing rapid
requests, preserving pause state, and continued playback after seeking. The tests
also require actual rendered frames, rather than only advancing timestamps.
It runs Qt offscreen to isolate simulated input from desktop focus and pointer
events. Audio stream configuration and fullscreen window state are checked
automatically; audible sound quality and actual TV output still need a device
check.

Fixtures, an isolated database, and screenshots are retained under
`.local/playback-test-*`. Your normal library and watch history are untouched.
The local debugging port is chosen automatically, and each test instance is
closed on success or failure. Normal launches do not enable remote debugging.
Input simulation is compiled only into the test build. Native test hooks and
screenshot capture also require `SCREENING_ROOM_TEST_OUTPUT_DIR` to be set;
captures accept only a PNG basename.

To exercise the renderer on a real Linux display, run
`SCREENING_ROOM_TEST_PLATFORM=xcb node tests/run-native.mjs`. For an isolated
16-second playback measurement with your own movies, run
`node tests/player-performance.mjs /path/to/movies`. Results under
`.local/player-performance-*` include frame drops, A/V timing, decoder selection,
render counts, and process CPU ticks. Leave the test window untouched during
measurement. These commands use the native test executable.

## Next hardware step

The WSLg audio hang was captured in PipeWire shutdown. The player now selects
WSLg's PulseAudio output directly. Real-audio seek, track-switch and restart
checks passed initially, but subsequent headless and visible WSLg runs still
hang intermittently after audio switching. This remains unresolved.
A 16-second 1080p measurement delivered approximately 24 fps with
one output frame drop and no decoder drops. Headset popping still needs a
listening check. See [player investigation](docs/player-investigation.md).

Hardware decoding is requested with `hwdec=auto`; software fallback is still
possible. Video uses libmpv's software render API and a Qt image surface. Native
builds default to `RelWithDebInfo` optimization unless another build type is
selected. A dedicated render thread honors mpv's frame presentation deadline.
Qt draws the latest completed frame; a bounded mailbox prevents frames from
accumulating if the interface is busy.

Player commands preserve their ordering while rendering continues on its own
thread; controls read the current mpv state. Timeline drags commit once on
release; rapid requests are combined over 60 ms, and repeated skip buttons use
the latest position. Switching audio primes the new stream at the current
position, including while paused. Audio output timing retains mpv's defaults.
For device diagnosis, `SCREENING_ROOM_HWDEC=no` disables hardware decoding and
`SCREENING_ROOM_AO` selects an mpv audio output explicitly. When `PULSE_SERVER`
points to `/mnt/wslg/PulseServer`, normal launches select `pulse`; elsewhere
they use automatic selection. This does not establish zero-copy 4K presentation or
guarantee artifact-free audio on every output device.
Filesystem scanning is still synchronous; metadata lookups and thumbnails are
asynchronous, and the bridge sends artwork URLs with the catalog. Large NAS
libraries still need device profiling.

On the Raspberry Pi, mount the Windows SMB share and build for the installed
ARM64 OS. Qt/libmpv hardware decoding, HDR output, audio passthrough, and remote
control support need testing on that exact device. This prototype does not
claim Pi/4K/HDR compatibility based on desktop playback alone.

Windows share connection details: [NAS.md](NAS.md).

Architecture references: [Qt WebChannel](https://doc.qt.io/qt-6/qtwebchannel-javascript.html)
and [mpv Render API examples](https://github.com/mpv-player/mpv-examples/tree/master/libmpv).
## Phone remote

Scan the QR code in the NAS Library’s top-right corner for a
browser remote with a swipe trackpad, tap-to-select, CinePro Home, NAS Home, and
Back, plus a volume slider. Keep the phone and player on the same home network.

The native app also advertises **Screening Room** to Roku-compatible phone remotes
on your local network. Discovery and control start automatically with the app.
See [phone remote setup and supported commands](REMOTE.md), including iPhone
Local Network permission and Raspberry Pi networking details.

## MCP remote

The optional [local MCP server](mcp/README.md) exposes remote buttons, text entry,
app switching, prepared title-search navigation, and basic app/volume status to Codex or another MCP client. It runs
over stdio and connects to the native app's existing receiver. Install its
dependencies separately in `mcp/`; no Raspberry Pi deployment is required.
