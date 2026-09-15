# Streaming configuration

All TV provider origins, movie/TV/anime URL templates, Core endpoints, Miruro
resolvers, and streaming API credentials are configured through one private file:
`.local/stream-providers.env`.

## Fresh clone

```sh
npm ci
npm run configure:streams -- --init
# Edit .local/stream-providers.env with your API credentials.
npm run setup:cinepro
npm run build:native
```

Initialization copies `config/stream-providers.env.example`, imports matching
credentials from legacy local files when present, and generates missing local
service tokens. It never overwrites an existing private configuration. Conflicting
legacy values must be resolved before initialization. The file is Git-ignored and
created with owner-only permissions. Legacy files are preserved but are no longer
the streaming configuration source.

`TMDB_READ_ACCESS_TOKEN` supplies catalog and NAS metadata access. `TMDB_API_KEY`
is used by Core providers requiring TMDB's API key. `LOCAL_API_TOKEN` and
`CINEPRO_API_TOKEN` authenticate local service calls. `CINEPRO_API_URL` selects
the web app's Core service (the default is its Compose service address).

## Change providers

Edit `STREAM_*` entries in the private file, then run:

```sh
npm run configure:streams
npm run setup:cinepro
npm run build:native
```

Restart the running services afterward. Credential-only changes require a restart,
not a rebuild. Process environment settings override the private file; missing
settings fall back to the public template. Provider URLs must use HTTPS and must
not contain credentials. Dynamic signed playback URLs are resolved at runtime.

The generator produces the browser catalog, server endpoint defaults, and native
navigation allowlist. Those outputs contain public settings only: do not edit them
by hand. API keys never belong in `STREAM_*` settings or `VITE_*` build variables.
The optional web Compose services load the same private file through `env_file`;
database and OAuth settings remain in `web/.env`.

## Prepare for GitHub

Publish the template and `vendor/` source snapshots; keep `.local/` private.
Before refreshing snapshots for publication, generate public defaults:

```sh
npm run configure:streams -- --defaults
npm run snapshot:sources
npm run test:stream-config
```

Review generated files and the Git diff before publishing. To restore local
provider overrides afterward, rerun `npm run configure:streams` and rebuild.
Snapshots exclude environment files, installed dependencies, caches, and runtime
data. See [source packaging](source-packaging.md). Nothing in these commands
uploads files, deploys to a Pi, or publishes a repository.
