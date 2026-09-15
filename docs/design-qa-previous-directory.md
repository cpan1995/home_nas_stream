# Directory design QA

final result: passed

## Visual truth and evidence

All six local references were opened before planning or editing. Primary truth:
`docs/design/screens/01-home-directory.png`, supported by
`docs/design/screens/00-layout-sketch.png`. The library exploration did not
supply Home navigation. Search and playback references informed their controls;
the movie-only catalog has no episode data.

Browser-rendered captures:

- `.local/screenshots/directory-1920.png`: Home, first movie selected and focused, 1920×1080 CSS/output pixels, device scale factor 1.
- `.local/screenshots/directory-3840.png`: Home, 3840×2160 CSS/output pixels, logical stage 1920×1080 scaled 2×. The image viewer downsamples the full image for inspection; capture retains 4K pixels.
- `.local/screenshots/directory-real.png`: actual two-file local catalog and locally extracted artwork.
- `.local/screenshots/search-1920.png`: search with remote keyboard and results.
- `.local/screenshots/options-3840.png`: movie options, 4K output and visible button focus.
- `.local/screenshots/options-1250.png`: smaller output at 1250px width.
- `.local/playback-test-rds5YU/native-player.png`, `native-library.png`: final native playback and directory return (1440×900 output, logical 1920×1080 controls centered/scaled).

The 1920 Home source and implementation were opened together in the same tool
comparison input. Full-view geometry, text, focus, and metadata were readable
at native resolution; no additional crop was needed for these simple panels.
The comparison uses the same first selected title and metadata. The source
shows 184 titles and illustrative artwork; the deterministic capture has 50
test titles and exercises the explicitly requested missing-artwork state.
The real-library capture separately verifies actual image rendering.

## Comparison history and findings

1. Initial implementation: P2 list typography/row height and heading spacing
   pushed the C heading below the visible area. Reduced heading line height,
   row title size/line height and list inset; retained 16px metadata for TV
   legibility. Post-fix `directory-1920.png` restores the intended A/B/C density.
2. Final paired Home comparison: no actionable P0/P1/P2 findings. Panel bounds
   match the source at x=64/856, y=144, with 760/1000 widths and 32px gap.
   Artwork remains contained at 944×420; actions/source path remain stationary.
3. Browser checks cover options and search at 1920, 3840 and 1250 widths. Dialogs
   receive their own scale because the browser top layer does not inherit the
   stage transform. Focus stays visible and contained.
4. Native capture initially needed stronger contrast over bright footage.
   Replaced the old gradients with translucent dark top/bottom rectangles;
   final native checks passed after this change. Pause receives initial visible
   focus; Full screen uses a text label to avoid a missing system-font glyph.

## Required fidelity surfaces

- Typography: locally bundled Fraunces 600 for selected titles, Nunito Sans
  400/600/700 for directory controls, rows and copy. Long rows ellipsize; selected
  titles wrap to two lines. Full title/source remain available in Movie options.
  Small metadata is intentionally 16px instead of the reference's smaller text.
- Layout: approved split-pane proportions, 64px side safe margins, 116px header,
  28px panel inset, 32px gap, 28px panel radii. No Home hero, rails, carousels,
  branding or poster wall. Only the left list scrolls.
- Colors: mist #EAF3FA, white/#F8FBFD panels, #14202B text, #526372 secondary,
  #2F6FED actions, #075DB8 4px focus ring, pale #D0E4F4 selection.
- Artwork: local catalog stills or a quiet film-icon placeholder. Source
  illustration is design sample content, not a real library asset. No generated
  substitute artwork or network image requests were introduced.
- Content: unbranded labels, real catalog count, title/year/runtime, optional
  synopsis/genre, source path and functional Play/Movie options. The decorative
  header circle became a useful Refresh button. Search uses text results and a
  complete A–Z/0–9 keyboard; it does not introduce streaming-service navigation.

## Verification surface

Use the local Vite preview and browser/native tests for this prototype.
Lavish was discontinued at the user’s request. The approved design is retained.

## Interaction and build evidence

15 Chromium tests passed: grouping/#, duplicate titles, selection/detail
updates, held arrows and visible scrolling, action transitions, search and
focus return, dialog arrows/Tab containment, loading/empty/NAS/retry, metadata
and artwork failures, refresh/removal, 1080p/4K scaling and real local media.
The primary flow reports no page errors. Production TypeScript/Vite and native
CMake builds passed; Prettier and `git diff --check` passed.

Native integration passed with actual Qt/libmpv playback: pause, seek, skip,
volume, tracks, subtitles, fullscreen, saved progress/restart, return focus and
missing-file error recovery. Final native artifacts:
`.local/playback-test-rds5YU/`.

## Follow-up device checks

No Pi endpoint was available. Actual 4K decode/presentation performance, HDR,
audio quality/passthrough, CEC repeat behavior and SMB dropouts remain hardware
checks. The native software render surface and synchronous scanner predate this
change; enabling `hwdec=auto` does not prove accelerated presentation on Pi.
