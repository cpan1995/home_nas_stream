# Phone remote over the local network

Screening Room starts a Roku ECP-compatible receiver with the native app. It
advertises **Screening Room** using SSDP (`roku:ecp`, UDP 1900) and accepts a
limited set of remote commands over HTTP and ECP-2 WebSocket sessions on TCP
8060. It uses Qt Network and Qt WebSockets. A browser remote is bundled and served by this receiver; no phone app or additional server is required.

The `/ecp-session` endpoint implements the Roku challenge/response handshake,
device/app queries, key commands, app launch, and ping/pong keep-alives. This is
the connection used by TV Remote - Universal from Zap Software Studio. The
handshake uses Roku's public protocol constant; it is not a secret password or
a replacement for keeping remote access on the home network. Session messages
are bounded to 16 KB; commands require a completed handshake. Browser-origin
sessions are rejected unless their origin is the receiver's own HTTP address.

On an iPhone, use a remote app with **Roku support**, allow its **Local Network**
permission, and connect the phone and player to the same home network. Scan for
devices and select **Screening Room**. If the app supports manually adding a
Roku, enter the player computer's LAN IP address and port 8060.

This is an implementation of part of the Roku remote protocol, not Roku OS or
official Roku hardware. Compatibility depends on the client's discovery and
device validation. Samsung/LG-only apps, apps that require a Roku account or
proprietary pairing, casting, voice search, and private listening are not
supported. Auto-discovery must be checked with the actual iPhone app.

## Web remote and QR code

In the NAS Library, scan the QR code in the **top-right corner**. Select it to
enlarge the code or choose another network address. Scan the QR code with your phone camera to open `http://PLAYER_IP:8060/remote/`.
The phone and player must be on the same home network. The QR is generated
locally and follows the receiver's configured port. If multiple network
addresses appear, select the address reachable from your phone. A disabled
receiver or missing LAN connection shows an unavailable message instead of a QR.

The phone layout has **CinePro home** and **NAS home** above a circular trackpad,
with a **Volume** slider and **Back** below. The slider sets app playback volume
from 0–100% and refreshes its value from the player. CinePro shows “Start playback”
when its volume control is unavailable. Swipe in any of the four directions to move focus; longer
swipes continue stepping. Tap to select. Home buttons leave playback and open
the relevant home page. Back uses the current view's existing back behavior.
Tap **Keyboard** to open search on the TV and focus a standard phone text field,
which uses the iPhone/Android system keyboard. Type or paste a single line (up to
256 characters), then use **Send text** or the keyboard’s Send key. Text appends
to the focused TV search field. **Delete** removes a character on the TV;
**Enter** confirms there. **Done typing** returns to the trackpad. Unsent text is
kept if the connection fails; text is never replayed automatically.

Connection failures disable controls and offer Reconnect; failed commands are
not retried or replayed. The page works without an internet connection.

Browser commands use a separate, fixed `/remote/command/` allowlist and require
the receiver's exact origin. Existing ECP endpoints still reject browser POSTs.
The phone page never receives the native WebChannel or access to library files.

## Controls

| Remote command | Screening Room behavior |
| --- | --- |
| Up / Down / Left / Right, Select, Back | Navigate the library, CinePro, and native playback controls |
| Home | Stop playback and return to the NAS library |
| Play | Toggle play/pause |
| Rev / InstantReplay, Fwd | Skip backward/forward 10 seconds |
| VolumeDown / VolumeUp, VolumeMute | Adjust or mute the app's player volume |
| Search, Lit_ text, Backspace, Enter | Open search and type using the phone keyboard |
| Info | Open audio/subtitle controls during playback |
| Apps: NAS Library, CinePro | Switch between the two app views |

CinePro transport and volume commands target its existing remote player controls;
availability depends on the selected provider. Volume affects playback in this
app, not the physical TV's speakers or power state. Clients that hide volume
controls for streaming-player devices may not show those buttons. Power and
shutdown commands are deliberately unsupported. Holding a directional button
repeats it; a missing release expires after two seconds.

## Startup and networking

The Pi's existing automatic-startup installer also starts this receiver because
it is part of the native executable. Rebuild with `bash scripts/build-pi.sh` after
updating the source package, then restart the app. The Pi must be powered on and
Screening Room running; the phone cannot boot it through this receiver.

The normal launch needs no new arguments. Disable it with
`--no-network-remote`. `--remote-port PORT` changes the HTTP port, but most Roku
clients expect 8060. A port conflict is logged and disables this receiver without
stopping the player. `.local/remote-device-id` stores a stable random device ID
(or under your `--data-dir`). It contains no credentials or pairing information.

The receiver permits connections from directly attached IPv4 subnets and
loopback. Compatible ECP clients do not use a PIN here: devices on those networks
can send playback controls. The endpoints expose device/app metadata and a fixed
set of input commands; they cannot read NAS files, run programs, open arbitrary
URLs, or access the native WebChannel. Cross-origin browser control requests and unrecognized Host names are rejected. Request sizes, connection counts, input
rates, and discovery replies are bounded.

Guest Wi-Fi/client isolation, separate VLANs, and firewalls can prevent discovery.
If a firewall is enabled on the Pi, allow UDP 1900 and TCP 8060 only from your
home subnet. No router port forwarding or internet-facing service is needed.

For the Windows/WSL development copy, mirrored networking and both Windows and
Hyper-V firewall permissions are needed. Run `scripts/enable-wsl-remote.ps1`
from an administrator PowerShell with `-Subnet YOUR_HOME_SUBNET`. It creates only
two named rules in each firewall, scoped to that subnet and the Private profile.
Use the same command with `-Remove` to remove those rules. This helper is not
needed on Raspberry Pi OS. A changed home subnet requires removing the old rules
and rerunning the helper with the new subnet.

## Verification

For connection troubleshooting, start the app with
`SCREENING_ROOM_REMOTE_DEBUG=1`. Its console logs discovery source IPs, accepted
connections, endpoint names, and HTTP response codes. Typed text and request
header values are omitted. Restart without that environment variable to stop
diagnostic logging.

```sh
cmake -S . -B build/native-test -G Ninja -DSCREENING_ROOM_TESTING=ON
cmake --build build/native-test -j 4
./build/native-test/network-remote-tests
node tests/network-remote-desktop.mjs
SCREENING_ROOM_REMOTE_TRANSPORT=web node tests/network-remote-desktop.mjs
SCREENING_ROOM_REMOTE_TRANSPORT=websocket node tests/network-remote-desktop.mjs
```

The protocol tests use actual TCP/UDP/WebSocket connections to check discovery,
stable identity, authentication, input, Unicode, request rejection, fragmented
requests, message limits, and held-button expiry.
The desktop test sends HTTP commands to the real Qt/WebEngine/mpv app and checks
search typing, navigation, NAS playback, mute/volume, Home, and a local CinePro
control fixture without exposing a native bridge to it. These tests do not
substitute for an actual iPhone-app or Raspberry Pi hardware test.

Protocol reference: [Roku ECP](https://developer.roku.com/dev/docs/external-control-api).
