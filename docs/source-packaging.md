# CinePro source snapshots

The runtime directories `.local/cinepro-ui` and `.local/cinepro` are ignored because they can contain credentials, media, databases, build output, and live diagnostic artifacts. Create the reviewable source package with:

```sh
node scripts/snapshot-cinepro-sources.mjs
```

This replaces `vendor/cinepro-ui` and `vendor/cinepro` with an allowlisted snapshot. It copies `src`, `public`, `tests`, and `scripts` trees, plus selected root manifests, configuration files, license files, README files, and the core runtime launch files (`run-local.sh`, `local-server.mjs`, `local-network.mjs`, and package-script check runners). Generated public TypeScript configuration under `src` is included. It records the HTTPS origin and checked-out commit in `SNAPSHOT_PROVENANCE.json` when local Git metadata is available. The provenance marks the result as a customized local snapshot.

The command rejects symlink source roots, skips symlink entries, and skips every environment-file variant (`.env*`, `*.env`, and `*.env.*`), Git metadata, dependency directories, build output, caches, runtime data, screenshots, reports, and local diagnostic tests. A credential-like literal in any otherwise eligible file stops the whole snapshot with its relative path; it is never silently omitted. The StreamMafia decryptor is included because its inspected constant is a protocol compatibility value, not a user credential. Provenance keeps only an HTTPS remote without userinfo, query, or fragment; a credential-bearing remote is recorded as `null`.

The snapshot intentionally does not contain dependency installs, compiled `dist` output, or the private central stream configuration. After restoring a fresh clone, initialize the central private file and generate its public defaults from the repository root:

```sh
npm ci
npm run configure:streams -- --init
# Edit .local/stream-providers.env with your credentials.
npm run setup:cinepro
```

The private file is `.local/stream-providers.env`; generated public settings are derived from it and `config/stream-providers.env.example`. These install and build steps are required before the restored launch files can run.

For a fresh clone, seed only missing runtime directories from the checked-in snapshots:

```sh
node scripts/snapshot-cinepro-sources.mjs --restore
```

Restore never overwrites an existing `.local/cinepro-ui` or `.local/cinepro` directory. It is a bootstrap helper, not a replacement for upstream source history or private runtime configuration.
