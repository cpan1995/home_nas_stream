# Repository map

## Application code

| Location | Purpose |
| --- | --- |
| `src/` | NAS library React interface and native bridge |
| `native/` | Qt shell, playback, phone remote, and network filtering |
| `public/` | Static browser assets |
| `config/online-filter.json` | Native player/script host allowlists and blocked domains |
| `scripts/` | Build, launch, installation, and review helpers |
| `tests/` | Browser, Node, Python, and native checks |
| `patches/cinepro-ui.patch` | Saved changes to the separate CinePro UI checkout |

## Local CinePro checkouts

The running CinePro integrations live in `.local/cinepro` (Core) and
`.local/cinepro-ui` (UI and its server). Both are ignored by this repository.
`npm run setup:cinepro` installs dependencies and builds existing checkouts; it
does not fetch their sources or apply the UI patch. A root checkout alone is
therefore insufficient to reproduce the CinePro installation. See
[CinePro installation](../CINEPRO.md#installation-and-changed-files).

Do not treat all of `.local/` as disposable build output: it also holds source
checkouts, credentials, library data, and runtime state.

## Provider configuration today

The TV provider catalog is currently code, not an editable runtime configuration.
In `.local/cinepro-ui/src/client/src/lib/screening-room.ts`, maintained in
`patches/cinepro-ui.patch`, it defines:

- Provider IDs, display names, and origins.
- Movie, TV, and anime URL construction and supported language variants.
- Known unavailable routes and manual-fallback rules.

Native frame-path validation is in `native/onlinefilter.cpp`; its host lists are
in `config/online-filter.json`. Changing a provider domain or URL format requires
checking both layers and rebuilding the affected applications. Adding a host to
the filter alone does not add a provider to the Servers dialog.

Standalone Core has separate implementations in `.local/cinepro/src/providers/`.
These are distinct from the TV-mode embed catalog.

## Focused verification

Run `npm run test:providers` for the existing source-URL, anime-mapping, and Miruro
resolver tests. This requires installed root dependencies and the customized
`.local/cinepro-ui` checkout. The tests use deterministic inputs; they do not
verify live third-party availability.

For browser integration, use the checks in
[anime provider documentation](anime-providers.md). Native URL-policy changes
also require the `online-filter-tests` target.

## Follow-up cleanup

1. Move provider metadata and URL templates into a validated catalog while
   preserving IDs, ordering, language variants, and unavailable/manual states.
2. Validate catalog URLs against the native filter to catch drift.
3. Record source revisions and a reproducible restoration process for both
   CinePro checkouts before reorganizing their storage.
