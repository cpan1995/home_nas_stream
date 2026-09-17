"""Exercise the launcher without starting a player or reading a real library."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "Checkout with spaces"
        (self.root / "scripts").mkdir(parents=True)
        (self.root / "build").mkdir()
        (self.root / ".local").mkdir()
        shutil.copyfile(ROOT / "scripts/start-pi.sh", self.root / "scripts/start-pi.sh")
        self.binary = self.root / "build/screening-room"
        self.binary.write_text(
            '#!/usr/bin/env python3\nimport json,os,sys\n'
            'print(json.dumps({"args":sys.argv[1:],"cwd":os.getcwd(),'
            '"config":os.environ["SCREENING_ROOM_STREAM_CONFIG"]}))\n'
        )
        self.binary.chmod(0o755)
        self.env = {k: v for k, v in os.environ.items() if not k.startswith("SCREENING_ROOM_")}

    def run_launcher(self, *args):
        return subprocess.run(
            ["bash", str(self.root / "scripts/start-pi.sh"), *args],
            cwd=self.temp.name, env=self.env, capture_output=True, text=True,
        )

    def test_default_and_forwarded_player_arguments(self):
        result = self.run_launcher("--cinepro", "--fullscreen")
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["cwd"], str(self.root))
        self.assertEqual(data["config"], str(self.root / ".local/stream-providers.env"))
        self.assertEqual(data["args"], ["--library", "/mnt/movies", "--data-dir", str(self.root / ".local"), "--cinepro", "--fullscreen"])

    def test_private_path_preserves_spaces_and_shell_characters(self):
        library = "/media/Movie collection/$literal;folder"
        (self.root / ".local/library-path").write_text(library + "\n")
        result = self.run_launcher()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["args"][1], library)

    def test_environment_overrides_local_file_and_data_directory(self):
        (self.root / ".local/library-path").write_text("")
        self.env.update(SCREENING_ROOM_LIBRARY_DIR="/media/Alternate Movies", SCREENING_ROOM_DATA_DIR="/tmp/Player Data")
        result = self.run_launcher()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["args"], ["--library", "/media/Alternate Movies", "--data-dir", "/tmp/Player Data"])

    def test_empty_private_file_reports_configuration_error(self):
        (self.root / ".local/library-path").write_text("\n")
        result = self.run_launcher()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("library-path", result.stderr)

    def test_missing_binary_reports_build_instruction(self):
        self.binary.unlink()
        result = self.run_launcher()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Build the application first", result.stderr)


if __name__ == "__main__":
    unittest.main()
