#!/usr/bin/env python3
"""Connect an SMB movie share read-only, with systemd automount at boot."""
import argparse
import getpass
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess
import sys
import tempfile

MARKER = '# Managed by Screening Room connect-nas.py'
MOUNT = Path('/mnt/movies')
CONFIG = Path('/etc/screening-room')
UNITS = Path('/etc/systemd/system')


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def share_path(value):
    value = value.strip().replace('\\', '/')
    if value.startswith('smb://'):
        value = '//' + value[6:]
    match = re.fullmatch(r'//([A-Za-z0-9][A-Za-z0-9.-]*)/([A-Za-z0-9_][A-Za-z0-9_. -]*)/?', value)
    if not match or match[2] in {'.', '..'}:
        raise ValueError('Use a share location such as //192.0.2.10/Movies (no subfolder).')
    return f'//{match[1]}/{match[2]}'


def credential_text(username, password):
    domain = ''
    if '\\' in username:
        domain, username = username.split('\\', 1)
    if not username or not password:
        raise ValueError('A username and account password are required.')
    if any(c in value for value in (username, domain, password) for c in '\r\n\0'):
        raise ValueError('Credentials cannot contain line breaks or NUL characters.')
    return f'username={username}\npassword={password}\n' + (f'domain={domain}\n' if domain else '')


def write_atomic(path, content, mode):
    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        os.fchmod(output.fileno(), mode)
        output.write(content)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--share', help=r'Windows share, e.g. \\192.0.2.10\Movies')
    parser.add_argument('--username', help=r'Windows account, e.g. MEDIA-PC\media-reader')
    args = parser.parse_args()
    if os.geteuid() != 0:
        os.execvp('sudo', ['sudo', sys.executable, str(Path(__file__).resolve()), *sys.argv[1:]])
    uid = int(os.environ.get('SUDO_UID', '0'))
    if uid == 0:
        raise ValueError('Run this script from your normal Pi user account, using sudo if needed.')
    user = pwd.getpwuid(uid)
    if not Path('/sbin/mount.cifs').exists() and not shutil.which('mount.cifs'):
        raise ValueError('Install the SMB client first: sudo apt-get install cifs-utils')
    source = share_path(args.share or input('NAS location (//computer/share): '))
    username = args.username or input('Windows username (COMPUTER\\username): ')
    mount_unit = UNITS / 'mnt-movies.mount'
    auto_unit = UNITS / 'mnt-movies.automount'
    for path in (mount_unit, auto_unit):
        if path.is_symlink() or (path.exists() and MARKER not in path.read_text().splitlines()):
            raise ValueError(f'An unrelated systemd unit already exists: {path}')
    if subprocess.run(['mountpoint', '-q', str(MOUNT)]).returncode == 0:
        raise ValueError('/mnt/movies is already mounted. Close playback and stop its mount before reconfiguring.')
    for line in Path('/etc/fstab').read_text().splitlines():
        fields = line.split()
        if fields and not line.lstrip().startswith('#') and len(fields) > 1 and fields[1] == str(MOUNT):
            raise ValueError('/mnt/movies already has an fstab entry; use that configuration instead.')
    if MOUNT.is_symlink() or (MOUNT.exists() and any(MOUNT.iterdir())):
        raise ValueError('/mnt/movies must be an empty directory, not a symbolic link.')
    if CONFIG.is_symlink():
        raise ValueError(f'{CONFIG} must not be a symbolic link.')
    CONFIG.mkdir(mode=0o700, exist_ok=True)
    os.chown(CONFIG, 0, 0)
    CONFIG.chmod(0o700)
    credentials = credential_text(username, getpass.getpass('Windows account password: '))
    options = f'ro,vers=3.0,sec=ntlmssp,uid={uid},gid={user.pw_gid},file_mode=0444,dir_mode=0555,nosuid,nodev,noexec'
    # Authenticate before installing persistent configuration. Never pass a password in argv.
    with tempfile.TemporaryDirectory(prefix='nas-check-', dir=CONFIG) as temporary:
        staging = Path(temporary)
        secret = staging / 'credentials'
        write_atomic(secret, credentials, 0o600)
        probe = staging / 'mount'
        probe.mkdir()
        run('timeout', '25', 'mount', '-t', 'cifs', source, str(probe), '-o', f'{options},credentials={secret}')
        try:
            with os.scandir(probe) as entries:
                count = sum(1 for _ in entries)
            print(f'Connected read-only; found {count} entries in the share.', flush=True)
        finally:
            run('umount', str(probe))
    secret = CONFIG / 'nas.credentials'
    mount_content = f'''{MARKER}
[Unit]
Description=Screening Room read-only movie share
Wants=network-online.target
After=network-online.target

[Mount]
What={source}
Where={MOUNT}
Type=cifs
Options={options},credentials={secret},_netdev
TimeoutSec=25
'''
    auto_content = f'''{MARKER}
[Unit]
Description=Connect Screening Room movies when accessed

[Automount]
Where={MOUNT}
TimeoutIdleSec=300

[Install]
WantedBy=multi-user.target
'''
    MOUNT.mkdir(exist_ok=True)
    write_atomic(secret, credentials, 0o600)
    write_atomic(mount_unit, mount_content, 0o644)
    write_atomic(auto_unit, auto_content, 0o644)
    run('systemctl', 'daemon-reload')
    run('systemctl', 'enable', '--now', 'mnt-movies.automount')
    run('systemctl', 'start', 'mnt-movies.mount')
    # Verify the Pi desktop user can actually read the mounted library.
    run('runuser', '-u', user.pw_name, '--', 'test', '-r', str(MOUNT))
    run('findmnt', '-n', '-t', 'cifs', '-o', 'SOURCE,TARGET,OPTIONS', '--mountpoint', str(MOUNT))
    print('Ready. Screening Room uses /mnt/movies. Refresh the NAS library in the app.')
    print('The share reconnects on access after boot. Keep the desktop powered on.')
    print('Credentials are stored only on this Pi in /etc/screening-room/nas.credentials (root-only).')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, subprocess.CalledProcessError, KeyboardInterrupt) as error:
        print(f'NAS setup stopped: {error}', file=sys.stderr)
        raise SystemExit(1)
