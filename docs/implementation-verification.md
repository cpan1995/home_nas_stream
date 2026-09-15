# TV directory implementation verification

Implemented in the existing checkout; pre-existing staged and unstaged work was
preserved. Nothing was committed, pushed, or deployed.

## Changed files for this implementation

- `src/main.tsx`: replaced the previous branded Home/player JSX with the directory entry point and local font imports.
- `src/screens/DirectoryScreen.tsx`: directory composition, overlays, TV scaling, playback and search return focus.
- `src/components/Directory.tsx`: header/search control, split panes, one alphabetical section and movie row implementation, selected panel.
- `src/components/Controls.tsx`: shared action variants, modal lifecycle/focus restoration.
- `src/components/Media.tsx`: reusable local artwork/fallback and metadata.
- `src/components/LibraryStates.tsx`: loading, empty, disconnected, playback failure states.
- `src/components/SearchScreen.tsx`: remote keyboard and searchable results.
- `src/hooks/useMediaLibrary.ts`: catalog/bridge lifecycle, refresh, separate library and playback errors.
- `src/hooks/useMovieSelection.ts`: immutable grouping and selection derived from movie ID.
- `src/hooks/useRemoteNavigation.ts`: shared focus, directional navigation, scrolling, Tab containment, Back handling.
- `src/media.ts`: deterministic A–Z/# ordering, duplicate tie-breaks, metadata formatting, local artwork policy.
- `src/tokens.css`, `src/styles.css`: shared visual tokens and the approved two-pane TV layout.
- `src/bridge.ts`: optional synopsis/genre/source path fields and unbranded browser playback failure.
- `package.json`, `package-lock.json`: locally bundled Fraunces and Nunito Sans dependencies.
- `index.html`: unbranded window title.
- `native/library.cpp`: retain relative source paths, including cached entries.
- `native/player.cpp`: request automatic hardware decoding; route refresh errors through catalog state.
- `native/Main.qml`: unbranded window and logical scaling for native controls.
- `native/PlaybackControls.qml`: readable blue/white/warm playback controls and dark overlays; native playback stays intact.
- `tests/library.spec.ts`: 15 deterministic/browser integration checks, with a real-library smoke check.
- `tests/native-smoke.mjs`: directory entry selector, playback focus restoration and missing-file error recovery; existing native tests preserved.
- `README.md`, `design-qa.md`, this file: updated operation and verification documentation.

## Checks

- `npm run build`: TypeScript and Vite production build passed.
- `npm test`: all 15 Chromium tests passed.
- `npm run build:native`: production frontend embedding, CMake configure, and native build passed.
- `npm run test:native`: Qt/libmpv integration, saved progress across restart, focus restoration and missing-file recovery passed (see final artifact path in task handoff/QA).
- `npx prettier --check src tests/library.spec.ts tests/native-smoke.mjs`: passed; no separate lint script is configured.
- `git diff --check`: passed.
- Inspected all six supplied reference images before implementation. Compared Home captures at 1920×1080 and checked 3840×2160 output, search and options.
- Verification uses the local app, screenshot comparisons, and browser/native tests. Lavish was discontinued at the user’s request.

## Remaining device verification

No Raspberry Pi endpoint or access configuration was available in the project.
Local native checks used Ubuntu/WSL with an isolated synthetic movie, not Pi
hardware. Verify the following on the Pi 5 and television:

- ARM64 Qt/libmpv build, codec-specific hardware decoder selection, sustained 4K playback and memory/CPU use. The pre-existing software render surface remains.
- HDMI output, overscan/safe margins, HDR/tone mapping, audible audio and passthrough.
- Real remote/CEC key mapping and repeat cadence.
- SMB authentication, throughput, disconnect/reconnect and stalled mounts. The app reports filesystem/scan errors, but an unmounted share leaving an ordinary empty directory cannot be distinguished from an empty library without mount configuration.
- Large-library startup/refresh performance: filesystem scanning remains synchronous. The TMDB update now sends image URLs with the catalog and generates fallback frames asynchronously on demand.

No series/episode backend was added to the movie-only catalog. Synopsis and genre
can now be populated by the TMDB enrichment stage.

## TMDB metadata update

- `native/tmdb.*` performs asynchronous, conservative title/year matching and
  fetches text metadata plus remote poster/backdrop URLs. It retries without the
  year and from the containing folder, retaining local details when uncertain.
- `native/library.*` caches TMDB results separately from file metadata and watch
  progress. Positive matches survive restarts; negative/error results have retry
  intervals. Changed-file stamps invalidate enrichment.
- Fallback frames are generated in memory by an asynchronous FFmpeg process and
  a bounded memory cache. Movie images are not persisted. Existing legacy artwork
  files remain untouched.
- The native frontend uses a memory-only WebEngine profile, allows TMDB image
  URLs, and falls back from backdrop to poster to a local frame. Metadata credits
  appear in Movie options.
- `tests/metadata.cpp`: four substantive Qt test cases (six results including
  setup/cleanup) pass for parsing/matching, year/folder retries, ambiguous/network
  failures, cache persistence, progress preservation, and no image files.
- All 16 directory browser tests and the native playback/restart checks pass.
  One earlier native run hit the existing intermittent CDP timeout during restart;
  the final complete run passed.
- Both existing Top Gun: Maverick files matched TMDB 361743 in a live scan.
  Qt HTTP/2 calls timed out in this environment; HTTP/1.1 requests succeeded.
- A pre-existing TypeScript error in the CinePro image-loading test needed an
  HTMLImageElement cast to allow the root production build to complete.
