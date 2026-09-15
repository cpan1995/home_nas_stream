# Home movie share

Configure the share for your own machine. Hostnames, accounts, interfaces and
movie paths belong in local configuration, not in published setup notes.

## Windows server

In an elevated PowerShell session, run the setup script with your existing movie
folder, playback account and Private network interface:

```powershell
.\scripts\setup-movies-share.ps1 -MoviePath 'D:\Media\Movies' -Reader 'MEDIA-PC\media-reader' -HomeInterface 'Ethernet'
```

These are examples; replace all three values. The script creates a read-only
`Movies` SMB share and a `HomeTheater-Movies-SMB-In` firewall rule restricted to
TCP 445, the selected Private interface and LocalSubnet. It refuses to overwrite
an existing share or rule and rolls back resources it created if setup fails.

Use the Windows account password when connecting, not a Windows Hello PIN.
Keep the server awake and reachable on the local network during playback.

## Pi client

Run `python3 scripts/connect-nas.py` and enter your actual share and account.
For example, `//192.0.2.10/Movies` and `MEDIA-PC\media-reader` illustrate the
format only; `192.0.2.10` is a documentation address, not a usable NAS address.
The script mounts the share read-only at `/mnt/movies`, enables automount and
keeps credentials in the root-readable `/etc/screening-room/nas.credentials`.

Verify that the Pi can list and play a file from your share after configuration.

## Local movie folder

The launcher defaults to `/mnt/movies`. For another location, put its absolute
Linux/WSL path on one line in `.local/library-path` (ignored by Git), or set
`SCREENING_ROOM_LIBRARY_DIR` in the Linux environment. The environment variable
takes precedence. Existing NAS mounts and credentials do not need to change.

## Removal

An administrator can remove the `Movies` share and `HomeTheater-Movies-SMB-In`
firewall rule. Removing the share does not delete the movie files.
