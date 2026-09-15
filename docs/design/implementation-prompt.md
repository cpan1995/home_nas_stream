# Implementation Brief: Raspberry Pi TV Media Directory

Implement the approved TV media-directory interface in `/path/to/home_nas_stream`.

## Read the local visual references first

Before planning or editing code, open and inspect every image below. Do not rely only on the written description.

- `docs/design/screens/00-layout-sketch.png` — the user's original split-pane sketch.
- `docs/design/screens/01-home-directory.png` — authoritative Home screen. This overrides any older Home or library exploration.
- `docs/design/screens/02-library.png` — secondary library/filter exploration only. Do not copy its poster grid or streaming-service patterns into Home.
- `docs/design/screens/03-title-details.png` — full title-details and episode layout reference.
- `docs/design/screens/04-search.png` — remote-friendly search layout reference.
- `docs/design/screens/05-player-overlay.png` — playback controls reference.

The editable Figma file is available at:

`https://www.figma.com/design/T05UFMIMexPkIuTrOm7ya7?node-id=8-2`

If the written brief and an older exploratory screenshot conflict, follow `01-home-directory.png` and `00-layout-sketch.png` for the primary Home experience.

## Project context

- Target: Raspberry Pi 5 with 4 GB RAM.
- Display: approximately 75-inch 4K television.
- Render the application UI at a logical 1920×1080 and scale cleanly to 4K output.
- Existing architecture: React/Vite embedded in Qt 6 WebEngine, with native Qt and libmpv handling video playback.
- Media lives on a Windows NAS/SMB share.
- Primary input is a directional television remote. Mouse support is secondary.
- The interface is intentionally unbranded. Do not add a product name, logo, splash screen, decorative title, or marketing copy.

## Primary Home experience

Home is the media directory itself. It must not look or behave like Netflix or another recommendation-driven streaming service.

Do not add featured heroes, recommendation rails, horizontal carousels, trending sections, promotional content, or a poster wall as the primary navigation model.

Build a two-pane layout:

### Left pane: alphabetical directory

- Approximately 40% of usable width.
- Vertically scrolling movie list grouped under A–Z headings.
- Put titles not beginning with A–Z in a final `#` group.
- Each reusable row shows title, release year, runtime, and a subtle details indicator.
- The selected row uses a pale-blue background plus a strong visible focus outline.
- Keep the selected row visible while scrolling.
- Do not use horizontal scrolling.

### Right pane: current selection

- Approximately 60% of usable width.
- Remains stationary while the left list scrolls.
- Updates immediately as selection changes.
- Shows artwork or a graceful placeholder, title, metadata, synopsis, subdued source path, Play, and Movie Options.
- It is a contained detail panel, not a full-width hero.

## Remote behavior

- Up/Down moves through movie rows and repeats smoothly when held.
- Right moves into the selected movie's actions.
- Left returns to the selected movie row.
- OK/Enter plays the selected movie unless an established project convention requires entering details first.
- Back/Escape returns to the prior application state.
- Closing search or returning from playback restores the prior movie selection and focus.
- Focus must never disappear off-screen and must not be communicated by color alone.

## DRY, reusable component architecture

Do not implement the page as one monolithic component. Inspect and reuse existing components and hooks before adding new ones.

Suggested responsibilities:

- `DirectoryScreen`
- `DirectoryHeader`
- `SearchControl`
- `SplitPaneLayout`
- `AlphabeticalMovieList`
- `AlphabetSection`
- `MovieListRow`
- `SelectedMoviePanel`
- `MediaArtwork`
- `MediaMetadata`
- `ActionButton`
- `FocusRing`
- `EmptyLibraryState`
- `DisconnectedLibraryState`
- `LoadingState`
- `PlaybackErrorState`

Requirements:

- Reuse one `MovieListRow` for every movie and one `AlphabetSection` for every letter group.
- Reuse action-button variants across screens.
- Centralize colors, typography, spacing, radii, and focus styling as tokens.
- Do not duplicate focus logic, navigation logic, JSX, or styling.
- Separate media loading, selection state, remote navigation, and presentation.
- Derive the right panel from the selected movie ID rather than copying movie data into multiple state locations.
- Prefer typed props and focused hooks over shared mutable state.
- Keep presentation components testable without the native player running.
- Avoid premature abstractions that do not remove real duplication.

## Visual direction

- Canvas: soft mist blue, approximately `#EAF3FA`.
- Panels: warm white, approximately `#F8FBFD` or white.
- Primary text: near-black, approximately `#14202B`.
- Secondary text: slate, approximately `#526372`.
- Primary blue: approximately `#2F6FED`.
- Focus blue: approximately `#075DB8`.
- Optional warm accent: approximately `#F2B880`.
- Fraunces SemiBold for prominent selected-movie titles.
- Nunito Sans for controls, list rows, metadata, and descriptions.
- Bundle fonts locally; do not require internet access at runtime.
- Use couch-readable sizes and television-safe margins.
- Avoid excessive shadows, gradients, glass effects, and motion.

## Implementation constraints

- Inspect the repository before changing anything.
- Replace the existing Home view instead of layering the directory over it.
- Reuse the current media model, player bridge, and navigation infrastructure where practical.
- Keep playback in the native libmpv path.
- Do not decode or copy video frames through React or JavaScript.
- Do not disable hardware video decoding.
- Preserve unrelated worktree changes and avoid unrelated refactors.
- Do not load external fonts or artwork at runtime.
- Handle long and duplicate titles, missing metadata or artwork, empty libraries, NAS disconnection, loading, and playback failure.

## Verification

- Run available frontend builds, tests, linting, and native checks.
- Test alphabetical sorting and grouping, the `#` group, selected-item detail updates, remote navigation, pane transitions, focus restoration, empty libraries, and disconnected NAS state.
- Verify at 1920×1080 and confirm clean scaling on a 4K output.
- Compare the implementation directly against the local screenshots.
- Test on Raspberry Pi hardware when reachable; otherwise identify remaining hardware-specific verification.
- Report files changed, checks performed, and remaining risks.

Deliver the working implementation, not only a plan.
