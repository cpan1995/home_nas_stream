# Player investigation — 2026-09-06

Status: the observed hang has a tested WSLg audio-backend workaround. The normal
`build/screening-room` executable is rebuilt with PulseAudio selection and the
render/seek improvements below. Close existing windows and relaunch to use it.
Audible headset popping has not been verified as fixed.

The user launched a second copy (PID 81739), which stayed alive but blocked for
minutes. GDB captured the mpv core waiting in PipeWire's `pw_thread_loop_stop`,
the PipeWire thread waiting in `epoll_wait`, and the Qt main thread waiting in
`mpv_get_property_string` from `Player::playbackState`. The binary hash matched
the original backup. Stack trace:
`.local/player-investigation/screening-room-hang-81739.log`.
The process resumed its event loop after debugger attachment/detachment; it was
not terminated. This identifies the observed audio-backend hang, not its
underlying PipeWire defect or the cause of every audible artifact.

Earlier real-audio runs were described as PulseAudio based on `PULSE_SERVER`;
that did not establish which backend mpv selected. Automatic selection can
attempt PipeWire first. WSLg exposes a PulseAudio server directly (see
https://github.com/microsoft/wslg). The player now selects `ao=pulse` when
`PULSE_SERVER` is `/mnt/wslg/PulseServer` (with or without the `unix:` prefix).
`SCREENING_ROOM_AO` still overrides this; other environments retain automatic
selection. Test diagnostics now report and assert `current-ao`.

- Explicit PulseAudio passed full controls and restart:
  `.local/playback-test-tOZf5p`.
- Automatic WSLg selection passed the same sequence and asserted `pulse`:
  `.local/playback-test-Aa23yl`.
- Zero video timing offset still dropped 201 frames during a 16-second movie
  sample (`.local/player-performance-lzUas3`). The renderer now uses mpv's normal
  lookahead and presentation wait on its dedicated worker.
- Final timing, same movie: 383 rendered frames in 16.06 seconds, one output
  drop, zero decoder drops, final A/V offset about -1.9 ms, `audioOutput=pulse`:
  `.local/player-performance-Yuny4u`.
- Final real WSLg/Wayland controls and restart checks passed, including seeking
  while paused/playing and changing audio. Diagnostics confirmed `pulse` and
  zero output/decoder drops during this synthetic-fixture run:
  `.local/playback-test-7qt7qq`.
- The six Qt metadata test results also pass.

Confirmed code issues:

- Every video frame was converted/scaled and alpha-corrected on Qt's painting
  path. Builds did not select an optimized build type by default.
- Timeline release could submit duplicate seeks, and relative skips used a
  periodically updated UI position.
- Rendering, frame timing and control calls shared the UI thread.

Installed changes:

- Optimized native builds and a dedicated software-render thread with a bounded
  latest-frame mailbox and mpv's normal lookahead/presentation timing.
- One seek per timeline release, a 60 ms coalescing window and relative skips
  calculated from the backend position.
- Per-file resume position included in the load command, and replacement audio
  primed at the current position.
- Regression checks and a repeatable playback measurement script.

Earlier investigation history and limits:

- Native builds and the six Qt metadata test results pass.
- An intermediate candidate passed all control, repeated-seek, audio-selection
  and restart tests with `SCREENING_ROOM_AO=null`; artifacts:
  `.local/playback-test-QszVEt`. This simulates an audio device and does not
  establish audible output quality.
- The real WSL automatic-audio runs stalled during startup or after paused audio
  selection / repeated seeks. The last run before backend selection was fixed is
  `.local/playback-test-OFwOsb`. These failures must not be described as passing.
- A 16-second intermediate rendering measurement reached approximately 24 fps
  with zero mpv frame drops (`.local/player-performance-Qvno3Z`). Subsequent
  changes mean this is not final performance certification.
- The original executable passed a short paused-track-switch/resume/seek
  comparison. A matching long stress comparison remains to be done.
- An OpenGL experiment used llvmpipe here and was removed. Audio timing
  experiments were also removed; the candidate retains mpv audio defaults.
- The popping sound has not been verified as fixed on physical speakers.

User confirmed playback through a headset using the CMD launcher. The launcher
runs the native app in Ubuntu/WSL, so audio crosses WSLg into Windows. The exact
headset connection/output device is still unknown. A brief idle-time host sample
showed 32% total CPU and 31.4/63.8 GiB RAM used; MapleIdleRPG and ChatGPT processes
were the largest sampled CPU consumers. WSL had 2.7/31 GiB RAM used, no swap use,
and a 0.03 one-minute load average. This sample does not show CPU or memory
exhaustion, but does not rule out playback-time spikes or GPU/audio contention.
Headset listening remains a user verification step; automated audio-output
checks cannot establish the absence of popping through the physical headset.

Original executable: `.local/player-investigation/screening-room-original`.
An older intermediate candidate is retained alongside it. The current production
binary is `build/screening-room`; test hooks are in `build/native-test/screening-room`.
No Git commit was made.

## Verification during the subsequent directory redesign

No native playback source changed during the UI update. The rebuilt embedded
frontend passes all 18 browser checks. A headless/offscreen native integration
run nevertheless timed out in `playbackState` after the audio-switch/resume
sequence: `.local/playback-test-zip2CX`. The child was already gone when a
debugger attempted to attach. Do not treat the earlier successful runs as proof
that every native audio-switch hang is resolved. The visible WSLg comparison
also timed out at the same step: `.local/playback-test-JjhOVo`. GDB captured
the audio thread in `pa_threaded_mainloop_wait`, the mpv core waiting on a mutex,
the renderer idle in its event loop, and the Qt main thread waiting on
`mpv_get_property`. This is a PulseAudio-path hang as well; forcing PulseAudio
avoids the earlier observed PipeWire shutdown path but is not a complete fix
for audio-switch hangs. Trace:
`.local/player-investigation/screening-room-ui-wayland-hang.log`.
