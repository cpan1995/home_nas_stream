# VidFast subtitle adapter repair

VidFast uses a custom MUI menu: language divs inside a button containing
Customize / Upload Subtitles / Off, plus a settings summary labeled Subtitles.
Earlier native captures under `.local/moviesapi-remote-check-*` established this
menu shape. The generic adapter only handled radio menu items and native text
tracks, so it could change a browser track flag without invoking VidFast's
caption-loading/rendering handler.

The isolated native track script in `native/Main.qml` now enumerates VidFast's
language rows, clicks the selected row (including Off), and confirms the
provider's Subtitles summary. If that summary is absent, it only marks an active
HTML track selected when cues have actually loaded. Language rows are discovered
on each request, so provider re-renders and lazy track creation are supported.
When the custom menu is missing, selection reports a failure instead of marking
an unloaded browser track selected. Other providers retain their adapters.

Verification on 2026-09-09:

- Five VidFast tests cover provider-rendered captions, sub/off, lazy creation,
  replaced menu nodes, missing controls, loaded-cue fallback and the TV picker.
- Four existing subtitle tests passed (generic/native tracks, Rivestream and
  the new anime provider hosts).
- Production and test native executables rebuilt successfully.
- Live VidFast movie/episode requests returned HTTP 403 in the isolated browser,
  so the repair is verified against provider-shaped fixtures, not live captions.

Restart the desktop executable to load the updated QML script. A separately
installed Raspberry Pi copy requires its own source update/build; these local
changes alone do not modify that deployment.
