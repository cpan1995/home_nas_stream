[CmdletBinding()]
param(
    [ValidateSet('directory', 'cinepro')][string]$Mode = 'directory',
    [string]$Action = ''
)
$ErrorActionPreference = 'Stop'
$project = if ($env:SCREENING_ROOM_PROJECT_DIR) { $env:SCREENING_ROOM_PROJECT_DIR } else { Split-Path -Parent $PSScriptRoot }
$distribution = $env:SCREENING_ROOM_WSL_DISTRO
# Explorer can launch these files directly from either WSL UNC spelling.
if ($project -match '^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)(\\.*)?$') {
    if (-not $distribution) { $distribution = $Matches[1] }
    $project = if ($Matches[2]) { $Matches[2].Replace('\', '/') } else { '/' }
}
$wslArgs = @()
if ($distribution) { $wslArgs += @('--distribution', $distribution) }
$wslArgs += @('--cd', $project, '--')
if ($Action -eq '--check') {
    if ($Mode -eq 'cinepro') { $wslArgs += @('node', 'scripts/cinepro-launch.mjs', '--ui-only') }
    else { $wslArgs += @('./build/screening-room', '--help') }
} else {
    $wslArgs += @('bash', 'scripts/start-pi.sh')
    if ($Mode -eq 'cinepro') { $wslArgs += '--cinepro' }
}
& wsl.exe @wslArgs
exit $LASTEXITCODE
