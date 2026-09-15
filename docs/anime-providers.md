# Anime providers

The Servers dialog adds MegaPlay, Anime Player, DropFile and Miruro, each with
separate sub/dub choices. Entries use the existing TMDB-to-AniList episode
mapping, including split seasons. No match means no anime sources; IDs and
language variants are never guessed. Regular movie/TV sources are unchanged.

## Integration

- MegaPlay: `https://megaplay.buzz/stream/ani/{anilistId}/{episode}/{sub|dub}`.
  Documentation: https://megaplay.buzz/api
- Anime Player: `https://ani.megaplay.su/ani/{anilistId}/{episode}/{sub|dub}`.
  Documentation: https://ani.megaplay.su/
- DropFile: `https://dropfile.cc/player/tv/anilist-{anilistId}/1/{episode}?audio={sub|dub}&lang=en&autoplay=0`.
  The AniList entry already identifies the season/part; the mapped episode is
  used within that entry. Documentation: https://dropfile.cc/
- Miruro: same-origin `/anime-player/{anilistId}/{episode}/{sub|dub}` loads
  `/api/anime/miruro/{anilistId}/{episode}/{sub|dub}`. The backend hosts a bounded
  adapter for MiruroAPI's episodes/sources protocol, rotating its documented
  upstream mirrors. No account, sidecar, public demo instance or new secret is
  required. Protocol reference: https://github.com/Shineii86/MiruroAPI/blob/main/src/helpers/pipe.js
  Attribution/license: [MiruroAPI MIT license](licenses/miruro-api.txt).

Miruro resolves the exact episode and category, tries up to four matching
providers, and retains the chosen provider's subtitle/caption tracks. Lookups
have an 18-second overall deadline, deduplicate concurrent requests, and cache
successful results for two minutes. Stream/track URLs use the existing opaque
media tickets and public-network guard; playlists and their segments are
rewritten through the same media route. Failures return 503 with a retry/change
server message. There is no arbitrary-URL proxy endpoint.

The local player uses bundled HLS.js and HTML video/text tracks. It handles TV
play/pause/seek/volume, subtitle off/selection, HLS audio and rendition selection,
and actual decoded-frame quality reports. All control messages verify their
parent frame and exact origin. External providers use the native video, track
and quality adapters. Only the new documented frame paths and exact script
hosts are added to the native filter; ad/promotion frames remain blocked.

This does not aggregate subtitles across different providers. External player
menus/native text tracks determine their subtitle choices. Miruro exposes the
tracks returned with its selected stream. Providers that burn captions into the
video cannot offer an independent subtitle-off option.

## Verification and observed availability (2026-09-09)

- Typecheck and production client/server build.
- `node --test tests/anime-providers.test.mjs tests/anime-mappings.test.mjs`
- `npx playwright test --config playwright.cinepro.config.ts tests/cinepro/anime-providers.spec.ts`
- Native `online-filter-tests` cover allowed paths and rejected lookalikes.
- UI fixtures exercise all eight choices, subtitle selection/off, message-origin
  rejection, lookup retry, and HLS decoded frames plus pause/seek/volume.

These deterministic tests verify integration, not third-party availability.
For AniList 154587 episode 1 sub, direct live requests returned a missing-file
page from MegaPlay, HTTP 403 from Anime Player, a connection timeout from
DropFile (also outside the network sandbox), and a 503 from the local Miruro
resolver. Keep these sources as selectable alternatives; the existing quality
scanner only promotes sources after decoding actual video. No bypass services
or paid fallback dependencies were introduced.

A subsequent browser iframe check of AniList 20 episode 1 sub loaded MegaPlay's
Naruto player, including a video element and captions. Anime Player returned a
missing-episode page for that sample. The MegaPlay observation confirms the
embed can load for some titles, but was not a native Qt decoded-frame test.

The final focused run passed seven browser tests and seven backend/mapping
tests. The Lavish screenshot review loaded without horizontal overflow; the
user approved the review and requested it be closed.
