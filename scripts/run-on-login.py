#!/usr/bin/env python3
"""XDG desktop-session launcher; run once per user and retain startup diagnostics."""
import fcntl
import os
from pathlib import Path
import sys


def main():
    if os.geteuid() == 0:
        raise RuntimeError("Screening Room must run as the desktop user, not root.")
    if not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
        raise RuntimeError("Screening Room needs a graphical desktop session.")
    root = Path(__file__).resolve().parent.parent
    state = Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local/state") / "screening-room"
    if not state.is_absolute():
        raise RuntimeError("XDG_STATE_HOME must be an absolute path.")
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock = os.open(state / "startup.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(lock)
        return 0
    # Retain the lock through bash's exec into the native app.
    os.set_inheritable(lock, True)
    log = state / "startup.log"
    if log.exists():
        log.replace(state / "startup.previous.log")
    output = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    os.dup2(output, 1)
    os.dup2(output, 2)
    os.close(output)
    os.execv("/bin/bash", ["bash", str(root / "scripts/start-pi.sh"), "--fullscreen"])


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError) as error:
        print(f"Screening Room startup failed: {error}", file=sys.stderr)
        raise SystemExit(1)
