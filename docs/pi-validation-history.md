# Historical Pi package validation

These notes describe the retired source-bundle snapshot. Its manifest and
temporary validation copies are not part of the consolidated project. Use
[the current Pi guide](raspberry-pi.md) for installation and validation commands.

The following checks passed using an isolated copy under `/tmp` on the existing
Ubuntu/WSL x86-64 development machine:

- NAS frontend TypeScript check and production build.
- CinePro Core TypeScript build.
- CinePro UI client/server production builds and type checks.
- CMake configure and full native Release build, with two compiler jobs.
- Syntax checks for the shell scripts and root JavaScript launch/setup scripts.
- Scan against the configured private credentials: none are in the package.

The validation copy used the existing installed Node dependencies, whose three
lockfiles match this package byte for byte. This was not a fresh dependency
installation or an ARM64 build. Vite reports existing large-chunk warnings for
the CinePro frontend.

No Docker image has been built. Pi display, audio, decoding, and memory use have
not been tested. The source bundle excludes all validation outputs and installed
dependencies; `MANIFEST.json` records the shipped files.

## Automatic startup installer

The package now includes `install-pi.sh`, a per-user XDG startup entry generator,
and a desktop-session launcher. Installer tests run without changing the current
computer's boot configuration or installing system packages. They cover failed
builds leaving boot settings untouched, startup-entry rollback on configuration
failure, idempotent installs, disabling startup, preservation of unrelated
entries, non-Pi refusal, and rejection of a corrupted runtime download.

A total of 13 installer/startup checks pass. A subprocess test launches a fixture application through the real login wrapper,
checks the fullscreen argument and startup log, and verifies a second automatic
launch cannot create a duplicate instance. GIO's real desktop-entry parser also
successfully launches the entry from a folder containing spaces, quotes, dollar
signs, percent signs, and a backslash. Run the checks with:

```sh
python3 -B tests/pi-startup.test.py
```

Actual Raspberry Pi apt installation, runtime download/execution, auto-login,
and power-on startup still require a connected Pi. No changes have been made to
this development computer's login settings. The NAS onboarding wizard remains
unimplemented.


## Network phone remote

The native app now includes a Roku-compatible HTTP and ECP-2 WebSocket receiver with SSDP
advertising. The current x86-64 development build and an isolated copy of this
updated package both compile successfully. WebSocket support adds the Qt WebSockets dependency, included in the installer.

Checks completed for this change:

- Protocol suite: eight functional tests plus setup/cleanup, all passing. Covers
  real TCP/UDP discovery, persistent device identity, command and Unicode input,
  malformed/browser-origin requests, fragmented requests, held-key expiry, and
  port conflicts, WebSocket authentication, and oversized message rejection.
- End-to-end remote test: HTTP commands reach the real Qt/WebEngine/mpv app and
  control navigation, Unicode search, playback, seeking, volume, mute/unmute,
  Home, and isolated CinePro control fixtures.
- Existing CinePro desktop regression: passes focus, retry, NAS return, page
  teardown, native-bridge isolation, and blocked external navigation checks.
- Existing Pi installer/startup suite: all 13 checks still pass.
- Running production app: multicast discovery responds on the home-network
  interface with its LAN address and HTTP 8060 endpoint; Linux LAN HTTP and
  Windows localhost HTTP respond. Firewall rules are limited to the private
  home subnet. Windows-to-WSL self-LAN HTTP/multicast tests time out; an external
  iPhone discovery/connection test remains unverified.

The iPhone app was observed requesting /ecp-session, which prompted ECP-2
WebSocket support. The updated handshake and WebSocket playback integration
pass on Windows; the Linux HTTP integration also passes. A phone subsequently authenticated and sent multiple
successful button commands to the updated Windows app. Raspberry Pi hardware
remains unverified.
The receiver implements a limited protocol; it is not guaranteed to work with
all apps advertising Roku support. See REMOTE.md for supported controls.

The broader native playback regression times out in WSL at the fullscreen/Space
resume step (`tests/native-smoke.mjs:289`). It fails at the same point in an
isolated build of the pre-change app extracted from the previous source archive,
as well as in the updated app with network remote disabled and with software
decoding. This is an existing playback/test-environment issue, not introduced by
the network receiver. It remains unresolved; the full playback suite is not
reported as passing for this update.
