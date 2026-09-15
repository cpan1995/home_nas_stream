import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("pi_installer", ROOT / "scripts/install-pi.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class StartupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="pi-startup-test-")
        self.root = Path(self.temporary.name) / "Movie App"
        self.root.mkdir()
        self.entry = Path(self.temporary.name) / "config/autostart/screening-room.desktop"
        self.binary = self.root / "build/screening-room"
        self.binary.parent.mkdir()
        self.binary.write_text("#!/bin/sh\nexit 0\n")
        self.binary.chmod(0o755)

    def tearDown(self):
        self.temporary.cleanup()

    def test_entry_handles_spaces_and_reinstall_does_not_duplicate(self):
        installer.write_startup(self.root, self.entry)
        original = self.entry.read_text()
        self.assertIn(f'Exec=/usr/bin/python3 "{self.root}/scripts/run-on-login.py"', original)
        installer.write_startup(self.root, self.entry)
        self.assertEqual(original, self.entry.read_text())
        if shutil.which("desktop-file-validate"):
            subprocess.run(["desktop-file-validate", str(self.entry)], check=True)

    def test_disable_preserves_other_autostarts(self):
        installer.write_startup(self.root, self.entry)
        other = self.entry.parent / "other.desktop"
        other.write_text("other app")
        installer.write_startup(self.root, self.entry, enabled=False)
        self.assertIn("Hidden=true", self.entry.read_text())
        self.assertEqual(other.read_text(), "other app")

    def test_unmanaged_or_linked_entry_is_not_overwritten(self):
        self.entry.parent.mkdir(parents=True)
        self.entry.write_text("[Desktop Entry]\nName=My existing app\n")
        with self.assertRaises(RuntimeError):
            installer.write_startup(self.root, self.entry)
        self.assertIn("My existing app", self.entry.read_text())
        self.entry.unlink()
        self.entry.symlink_to(self.binary)
        with self.assertRaises(RuntimeError):
            installer.write_startup(self.root, self.entry)

    def test_failed_autologin_restores_previous_entry(self):
        installer.write_startup(self.root, self.entry, enabled=False)
        previous = self.entry.read_bytes()

        def fail_boot(args, **kwargs):
            if args[0] == "sudo":
                raise subprocess.CalledProcessError(1, args)

        with patch.object(installer, "run", side_effect=fail_boot):
            with self.assertRaises(subprocess.CalledProcessError):
                installer.enable_startup(self.root, self.entry)
        self.assertEqual(previous, self.entry.read_bytes())

    def test_failed_first_enable_removes_new_entry(self):
        with patch.object(installer, "run", side_effect=OSError("validation failed")):
            with self.assertRaises(OSError):
                installer.enable_startup(self.root, self.entry)
        self.assertFalse(self.entry.exists())

    def test_missing_build_cannot_enable_autologin(self):
        self.binary.unlink()
        with patch.object(installer, "run") as run:
            with self.assertRaises(RuntimeError):
                installer.enable_startup(self.root, self.entry)
            run.assert_not_called()
        self.assertFalse(self.entry.exists())

    def test_boot_configuration_is_last_after_build(self):
        commands = []
        with patch.object(installer, "ROOT", self.root), patch.object(installer, "preflight"), \
             patch.object(installer, "startup_path", return_value=self.entry), \
             patch.object(installer, "install_node"), \
             patch.object(installer, "run", side_effect=lambda args, **kwargs: commands.append(args)), \
             patch.object(sys, "argv", ["install-pi.py"]):
            self.assertEqual(installer.main(), 0)
        self.assertEqual(commands[-1], ["sudo", "/usr/bin/raspi-config", "nonint", "do_boot_behaviour", "B4"])
        self.assertLess(next(i for i, cmd in enumerate(commands) if cmd[0] == "bash"), len(commands) - 1)

    def test_build_failure_does_not_touch_boot_settings(self):
        commands = []

        def fail_build(args, **kwargs):
            commands.append(args)
            if args[0] == "bash":
                raise subprocess.CalledProcessError(1, args)

        with patch.object(installer, "ROOT", self.root), patch.object(installer, "preflight"), \
             patch.object(installer, "startup_path", return_value=self.entry), \
             patch.object(installer, "install_node"), patch.object(installer, "run", side_effect=fail_build), \
             patch.object(sys, "argv", ["install-pi.py"]):
            self.assertEqual(installer.main(), 1)
        self.assertFalse(self.entry.exists())
        self.assertFalse(any("do_boot_behaviour" in cmd for cmd in commands))

    def test_non_pi_check_is_read_only(self):
        with patch.object(installer.os, "geteuid", return_value=1000), \
             patch.object(installer.platform, "machine", return_value="x86_64"), \
             patch.object(installer, "run") as run, patch.object(sys, "argv", ["install-pi.py", "--check"]):
            self.assertEqual(installer.main(), 1)
            run.assert_not_called()

    def test_checksum_mismatch_prevents_extraction(self):
        filename = "node-v22.99.0-linux-arm64.tar.xz"
        commands = []

        def download(args, **kwargs):
            commands.append(args)
            target = Path(args[-1])
            target.write_bytes(("0" * 64 + "  " + filename + "\n").encode() if target.name == "SHASUMS256.txt" else b"corrupted")

        with patch.object(installer, "run", side_effect=download):
            with self.assertRaisesRegex(RuntimeError, "checksum failed"):
                installer.install_node(self.root)
        self.assertFalse((self.root / ".local/node").exists())
        self.assertFalse(any(cmd[0] == "tar" for cmd in commands))

    def test_download_selection_requires_one_arm64_node22_archive(self):
        digest = "a" * 64
        self.assertEqual(installer.node_release(f"{digest}  node-v22.22.1-linux-arm64.tar.xz\n"), (digest, "node-v22.22.1-linux-arm64.tar.xz"))
        with self.assertRaises(RuntimeError):
            installer.node_release(f"{digest}  node-v22.22.1-linux-x64.tar.xz\n")
        with self.assertRaises(ValueError):
            installer.desktop_argument("bad\npath")
        self.assertIn("100%%", installer.desktop_argument("/apps/100% movies"))

    def test_desktop_exec_is_parsed_correctly_by_gio(self):
        try:
            from gi.repository import Gio
        except ImportError:
            self.skipTest("GIO is not installed")
        special = Path(self.temporary.name) / 'Movies 100% $value "quoted" \\folder'
        scripts = special / "scripts"
        scripts.mkdir(parents=True)
        result = special / "launched"
        (scripts / "run-on-login.py").write_text('from pathlib import Path\nPath(__file__).resolve().parent.parent.joinpath("launched").write_text("ok")\n')
        installer.write_startup(special, self.entry)
        app = Gio.DesktopAppInfo.new_from_filename(str(self.entry))
        self.assertIsNotNone(app)
        self.assertTrue(app.launch([], None))
        for _ in range(100):
            if result.exists():
                break
            time.sleep(0.02)
        self.assertEqual(result.read_text(), "ok")

    @unittest.skipIf(os.geteuid() == 0, "The graphical app intentionally refuses root")
    def test_login_runs_fullscreen_once_and_logs_output(self):
        scripts = self.root / "scripts"
        scripts.mkdir()
        shutil.copyfile(ROOT / "scripts/run-on-login.py", scripts / "run-on-login.py")
        (scripts / "start-pi.sh").write_text('exec /usr/bin/python3 "$(dirname "$0")/fake-app.py" "$@"\n')
        (scripts / "fake-app.py").write_text(
            'import json,os,sys,time\nfrom pathlib import Path\n'
            'Path(os.environ["XDG_STATE_HOME"],"args.json").write_text(json.dumps(sys.argv[1:]))\n'
            'print("application started",flush=True)\ntime.sleep(15)\n'
        )
        state = Path(self.temporary.name) / "state"
        env = {**os.environ, "XDG_STATE_HOME": str(state), "DISPLAY": ":99"}
        command = [sys.executable, "-B", str(scripts / "run-on-login.py")]
        first = subprocess.Popen(command, env=env)
        try:
            for _ in range(100):
                if (state / "args.json").exists():
                    break
                time.sleep(0.02)
            self.assertEqual(json.loads((state / "args.json").read_text()), ["--fullscreen"])
            second = subprocess.run(command, env=env, timeout=3)
            self.assertEqual(second.returncode, 0)
            self.assertIsNone(first.poll())
            self.assertIn("application started", (state / "screening-room/startup.log").read_text())
        finally:
            first.terminate()
            first.wait(timeout=3)


if __name__ == "__main__":
    unittest.main()
