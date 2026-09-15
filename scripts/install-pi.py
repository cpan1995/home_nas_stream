#!/usr/bin/env python3
"""Install and build as the desktop user; use sudo only for OS configuration."""
import argparse
import hashlib
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
MARKER = "X-ScreeningRoom-Managed=true"
PACKAGES = [
    "build-essential", "cmake", "ninja-build", "pkg-config", "curl",
    "ca-certificates", "xz-utils", "desktop-file-utils", "cifs-utils",
    "qt6-base-dev", "qt6-declarative-dev", "qt6-webengine-dev", "qt6-websockets-dev", "libmpv-dev", "ffmpeg",
    "qml6-module-qtquick", "qml6-module-qtquick-window", "qml6-module-qtqml-workerscript",
    "qml6-module-qtwebengine", "qml6-module-qtwebchannel", "qml6-module-qtquick-controls",
    "qml6-module-qtquick-layouts", "libqt6sql6-sqlite", "qt6-wayland", "qt6-svg-plugins",
]


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def startup_path():
    config = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config")
    if not config.is_absolute():
        raise RuntimeError("XDG_CONFIG_HOME must be an absolute path.")
    return config / "autostart/screening-room.desktop"


def check_startup_file(path):
    if path.is_symlink():
        raise RuntimeError(f"Refusing to replace a linked startup entry: {path}")
    if path.exists() and MARKER not in path.read_text().splitlines():
        raise RuntimeError(f"An unrelated startup entry already exists: {path}. Move it before installing.")


def desktop_argument(value):
    # Desktop Entry string escaping is applied before Exec argument parsing.
    if any(ord(char) < 32 for char in value):
        raise ValueError("Control characters are not supported in installation paths.")
    value = value.replace("%", "%%")
    for char in ['\\', '"', '`', '$']:
        value = value.replace(char, "\\" + char)
    return '"' + value.replace("\\", "\\\\") + '"'


def write_startup(root, path, enabled=True):
    check_startup_file(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    content = (
        "[Desktop Entry]\nType=Application\nName=Screening Room\n"
        "Comment=Open the TV movie interface on login\n"
        f"Exec=/usr/bin/python3 {desktop_argument(str(root / 'scripts/run-on-login.py'))}\n"
        "TryExec=/usr/bin/python3\nTerminal=false\n"
        f"Hidden={'false' if enabled else 'true'}\n{MARKER}\n"
    )
    # Re-running the installer updates only our own entry, without duplicates.
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        output.write(content)
    try:
        temporary.chmod(0o644)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def preflight():
    if os.geteuid() == 0:
        raise RuntimeError("Run bash install-pi.sh as your normal Pi desktop user, without sudo. The installer requests sudo when needed.")
    model = Path("/proc/device-tree/model")
    if platform.machine() != "aarch64" or not model.exists() or "Raspberry Pi" not in model.read_text():
        raise RuntimeError("This installer requires a Raspberry Pi running a 64-bit ARM desktop OS.")
    if not Path("/usr/bin/raspi-config").is_file() or not Path("/etc/init.d/lightdm").exists():
        raise RuntimeError("Install Raspberry Pi OS with Desktop first. The Lite/headless edition is not supported by this installer.")
    if not shutil.which("sudo"):
        raise RuntimeError("sudo is required to install system packages and enable desktop auto-login.")
    if not os.access(ROOT, os.W_OK):
        raise RuntimeError("Extract the package into a folder owned by your desktop user before installing.")
    desktop_argument(str(ROOT))
    check_startup_file(startup_path())


def node_compatible(binary):
    if not binary.is_file():
        return False
    try:
        result = run([str(binary), "-p", "JSON.stringify({version:process.versions.node,arch:process.arch})"], capture_output=True, text=True)
        import json
        value = json.loads(result.stdout)
        version = tuple(int(part) for part in value["version"].split("."))
        return version >= (22, 19, 0) and value["arch"] == "arm64"
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError):
        return False


def node_release(checksums):
    matches = re.findall(r"^([a-f0-9]{64})\s+(node-v22\.\d+\.\d+-linux-arm64\.tar\.xz)$", checksums, re.MULTILINE)
    if len(matches) != 1:
        raise RuntimeError("Could not identify the official Node 22 ARM64 download.")
    return matches[0]


def install_node(root):
    local = root / ".local"
    destination = local / "node"
    if node_compatible(destination / "bin/node"):
        return
    if destination.exists() or destination.is_symlink():
        raise RuntimeError(f"An incompatible runtime exists at {destination}; move it aside before retrying.")
    local.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="node-install-", dir=local) as temporary:
        staging = Path(temporary)
        checksums = staging / "SHASUMS256.txt"
        curl = ["curl", "--fail", "--show-error", "--silent", "--location", "--proto", "=https", "--proto-redir", "=https", "--connect-timeout", "20", "--max-time", "600", "--retry", "3"]
        run(curl + ["https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt", "--output", str(checksums)])
        expected, filename = node_release(checksums.read_text())
        archive = staging / filename
        version = filename.removeprefix("node-").removesuffix("-linux-arm64.tar.xz")
        run(curl + [f"https://nodejs.org/dist/{version}/{filename}", "--output", str(archive)])
        if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
            raise RuntimeError("Node download checksum failed. Nothing was installed.")
        run(["tar", "-xJf", str(archive), "-C", str(staging)])
        extracted = staging / filename.removesuffix(".tar.xz")
        if not node_compatible(extracted / "bin/node"):
            raise RuntimeError("Downloaded Node runtime could not run on this Pi.")
        extracted.rename(destination)
    print("Installed a private Node.js runtime for Screening Room.", flush=True)


def enable_startup(root, path):
    binary = root / "build/screening-room"
    if not binary.is_file() or not os.access(binary, os.X_OK):
        raise RuntimeError("Build the app successfully before enabling automatic startup.")
    check_startup_file(path)
    previous = path.read_bytes() if path.exists() else None
    try:
        write_startup(root, path)
        run(["desktop-file-validate", str(path)])
        # sudo supplies SUDO_USER, which raspi-config uses as the auto-login user.
        # Do this last: failed downloads/builds must not change boot behavior.
        run(["sudo", "/usr/bin/raspi-config", "nonint", "do_boot_behaviour", "B4"])
    except Exception:
        if previous is None:
            path.unlink(missing_ok=True)
        else:
            path.write_bytes(previous)
        raise


def main():
    parser = argparse.ArgumentParser(description="Install Screening Room and open it fullscreen after Pi desktop login.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--startup-only", action="store_true", help="Enable startup for an already-built app; skip package installation and compilation.")
    mode.add_argument("--disable-startup", action="store_true", help="Disable this app's automatic launch; leave desktop login and saved data intact.")
    mode.add_argument("--check", action="store_true", help="Check Pi prerequisites without installing or changing settings.")
    args = parser.parse_args()
    try:
        if args.disable_startup:
            if os.geteuid() == 0:
                raise RuntimeError("Run this command as the Pi desktop user, without sudo.")
            write_startup(ROOT, startup_path(), enabled=False)
            print("Automatic app startup disabled. Close the app to return to the desktop.")
            return 0
        preflight()
        if args.check:
            print(f"Pi desktop prerequisites passed. Installation folder: {ROOT}")
            return 0
        if not args.startup_only:
            print("Installing build dependencies, building the app, then enabling desktop auto-login and fullscreen startup.", flush=True)
            run(["sudo", "-v"])
            run(["sudo", "apt-get", "update"])
            run(["sudo", "apt-get", "install", "-y", *PACKAGES])
            install_node(ROOT)
            env = os.environ.copy()
            env["PATH"] = str(ROOT / ".local/node/bin") + os.pathsep + env.get("PATH", "")
            run(["bash", str(ROOT / "scripts/build-pi.sh")], cwd=ROOT, env=env)
        enable_startup(ROOT, startup_path())
        print("Installed. Restart the Pi when ready; Screening Room will open fullscreen after desktop login.")
        print("Keep this folder in place. Alt+F4 closes the app; bash install-pi.sh --disable-startup disables future launches.")
        if not (ROOT / ".local/stream-providers.env").exists():
            print("CinePro credentials still need configuring; see README.md. NAS setup remains manual in this version.")
        return 0
    except (RuntimeError, ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"Installation stopped: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
