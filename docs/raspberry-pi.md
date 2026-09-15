# Screening Room — Raspberry Pi setup

Run all commands below from the project root, `/path/to/home_nas_stream` on the
development PC or the existing application directory on the Pi. The installer
and source now live in that single project tree; there is no separate source
package directory. This PC cleanup does not change the running Pi deployment.

This is a source bundle, not a compiled ARM64 executable, Docker image, or SD-card
image. Build it on the target machine. A 1080p H.264 movie has been checked through
both the browser and native player on a Pi 5. Docker deployment is a separate step; the web service is
still configured for access from this device only.

## One-time installation and automatic startup

On a Raspberry Pi with **64-bit Raspberry Pi OS with Desktop**, extract this
folder into your desktop user's home directory. Keep the folder there after
installation. Open a terminal in this folder and run:

```sh
bash install-pi.sh
```

Run as your normal desktop user, **without putting sudo before the command**.
The installer requests administrator access for system packages and auto-login.
It installs the native build dependencies, downloads an official Node 22 ARM64
runtime and checks its SHA-256 checksum, builds the app, then configures desktop
auto-login and fullscreen startup for that user. Node lives in `.local/node/`
inside this folder; it does not replace the system's Node installation.

Restart when the installer finishes. The normal Pi boot sequence and desktop
session load first, then Screening Room opens fullscreen. No separate startup
configuration is needed. This does not replace Pi OS with a custom boot image.
The installer does not reboot automatically.

The app opens the NAS library by default. CinePro credentials and NAS mounting
still use the configuration steps below. **The first-run NAS username/password
wizard is not implemented yet.** Existing configuration is retained by a repeat
installation; the installer does not collect, print, or replace credentials.

Useful commands:

```sh
# Read-only checks before installation:
bash install-pi.sh --check
# Enable startup for an app you have already built:
bash install-pi.sh --startup-only
# Disable only the app's automatic launch:
bash install-pi.sh --disable-startup
```

Press **Alt+F4** to close the app and return to the desktop. It will reopen on the
next login unless startup is disabled. To also require a desktop login password
again, use `sudo raspi-config nonint do_boot_behaviour B3`.

The mouse pointer hides after three seconds without mouse activity in Screening
Room, including CinePro and video playback. Move the mouse to show it again.

During online playback, choose **Servers → Rivestream** to try its TMDB-based
movie/episode embed. It supports the app's remote playback controls and Strata
subtitle menu. Source availability and title matching depend on Rivestream;
see [CINEPRO.md](../CINEPRO.md) for observed provider limitations.

The startup entry is `~/.config/autostart/screening-room.desktop` (or under
`XDG_CONFIG_HOME` if configured). It uses the desktop's XDG autostart support,
including the default Raspberry Pi OS labwc session; it does not replace your
labwc configuration. It launches only one automatic instance at a time and
records output in `~/.local/state/screening-room/startup.log`, retaining the
previous launch's log. A customized desktop that disables XDG autostart must
restore that support first.

References: [Raspberry Pi boot configuration](https://www.raspberrypi.com/documentation/computers/configuration.html),
[desktop autostart specification](https://specifications.freedesktop.org/autostart/latest/),
and [official Node 22 downloads](https://nodejs.org/dist/latest-v22.x/).

## Contents

The native app also starts a **Roku-compatible phone remote receiver** and
advertises **Screening Room** on your home network. On an iPhone, use a remote app
with Roku support and allow Local Network access. See [REMOTE.md](../REMOTE.md) for
supported controls, compatibility limits, and firewall details. No extra Pi
service installation is required; rebuild and restart the app after updating.

- `native/`, `src/`, `config/`: desktop player, NAS interface, and provider rules.
- `.local/cinepro-ui/`: complete customized online interface and server source.
- `.local/cinepro/`: Core source, network guard, and optional standalone service.
- `install-pi.sh`, `scripts/`: one-time installer, source builds, service startup, and Pi launch scripts.
- `tests/`: existing regression checks; no generated fixtures or recordings.
- `patches/`: upstream UI patch for reference. The included UI already has the changes.
- `docs/`: setup instructions and development notes.

Dependencies are described by all three `package-lock.json` files. They are
installed on the target, so no PC-specific `node_modules` or executable is included.
When transferring source to another device, exclude private `.env` files,
`tmdb.env`, movie files, watch history, databases, logs, caches, `node_modules/`
and PC build outputs. Preserve the Pi's existing configuration. Third-party
licenses are included with their source trees.

## Manual build on the Pi

The one-time installer above performs these steps automatically. Use this
section only if you prefer to install and build manually.

Use a 64-bit desktop OS with Qt 6 WebEngine packages for ARM64. Install Node.js
22.19 or newer and npm, then the native build/runtime dependencies:

```sh
sudo apt-get update
sudo apt-get install build-essential cmake ninja-build pkg-config \
  qt6-base-dev qt6-declarative-dev qt6-webengine-dev qt6-websockets-dev libmpv-dev ffmpeg \
  qml6-module-qtquick qml6-module-qtquick-window qml6-module-qtqml-workerscript \
  qml6-module-qtwebengine qml6-module-qtwebchannel qml6-module-qtquick-controls \
  qml6-module-qtquick-layouts libqt6sql6-sqlite qt6-wayland qt6-svg-plugins
bash scripts/build-pi.sh
```

The script uses two native compilation jobs by default. It installs the locked
Node dependencies and builds both CinePro projects and the desktop executable.
Internet access is required to install dependencies. If your OS release does not
provide `qt6-webengine-dev` for ARM64, resolve that OS/package prerequisite before
building; this bundle does not compile Qt itself.

## Configure CinePro

Initialize the shared private configuration, then edit it:

```sh
npm run configure:streams -- --init
```

Set `TMDB_READ_ACCESS_TOKEN` (and `TMDB_API_KEY` for Core providers that need it)
in `.local/stream-providers.env`. Initialization generates the local service tokens
and sets owner-only file permissions. NAS metadata uses the same read token.
Run `npm run configure:streams` and rebuild after changing provider URLs.
Restart services after changing credentials. Builds do not require private tokens.
See [stream configuration](stream-configuration.md).

## Run

On ARM64 Linux the app uses OpenGL for GPU composition. Use **1920×1080 at 60 Hz**
for TV output: a 20-second Pi 5 check delivered 481 frames with zero drops in both
the browser and native player. The same browser video at 4K output dropped 45
frames. These checks cover a 1080p H.264 source, not 4K decoding or every online
provider. Select the display mode in Pi OS display settings; the source installer
does not change your monitor configuration.

For graphics troubleshooting, `SCREENING_ROOM_GRAPHICS=software` restores CPU
composition. The app's NAS video renderer still uses mpv's software rendering API;
OpenGL accelerates the interface/browser composition, not every codec's decoding.

To connect a Windows/NAS SMB share, run:

```sh
python3 scripts/connect-nas.py
```

Enter the share location (for example `//192.0.2.10/Movies`), Windows username
(for example `MEDIA-PC\media-reader`), and the Windows account password when prompted.
The password is hidden while typing. For a manual installation, install
`cifs-utils` first with `sudo apt-get install cifs-utils`.

The script tests access, mounts the share **read-only** at `/mnt/movies`, and
enables a systemd automount so it reconnects when accessed after startup.
Credentials are stored in `/etc/screening-room/nas.credentials`, readable only by
root; they are never included in this source package. Keep the computer hosting
the share powered on. Refresh the NAS library after connecting. Reserve the
server's IP in your router if you use an IP address for the share location.

To disconnect and disable future automatic connections, close any playing movie
and run `sudo systemctl disable --now mnt-movies.automount`, followed by
`sudo systemctl stop mnt-movies.mount`. The saved credentials remain on the Pi.
Run the connection script again after disconnecting to change the share or account.

Mount your movie folder at `/mnt/movies`, or set `SCREENING_ROOM_LIBRARY_DIR` to
its location. Run from your Pi's graphical desktop session:

```sh
bash scripts/start-pi.sh --fullscreen
# Or open CinePro immediately:
bash scripts/start-pi.sh --fullscreen --cinepro
# Another movie location:
SCREENING_ROOM_LIBRARY_DIR=/media/movies bash scripts/start-pi.sh
```

The native app starts CinePro's local UI automatically. Normal desktop playback
uses the embedded providers and does not start the optional Core server. Keep
the executable under `build/` so it can find the bundled launch script.

NAS catalog/progress and runtime logs are created under `.local/`; CinePro's anime
mapping cache is created under `.local/cinepro-ui/data/`. These are per-device
files: retain them on the Pi and exclude PC data when transferring source.
`SCREENING_ROOM_DATA_DIR` changes the NAS database location only.
The desktop web profile remains temporary, as in the original application.

The optional standalone Core command (`npm run start:cinepro`) also needs
`bubblewrap` and Node.js at `/usr/bin/node`. The Pi desktop flow does not need it.
Core uses a Linux sandbox; its library mounts account for ARM64 systems without
`/lib64`.

## Verify the consolidated source

The installer/startup tests do not change system boot settings:

```sh
python3 -B tests/pi-startup.test.py
```

The previous archive's manifest applied only to that snapshot and has been
retired. Use builds and regression checks against the current source tree.
