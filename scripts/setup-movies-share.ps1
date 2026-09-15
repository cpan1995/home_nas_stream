# Run in an elevated Windows PowerShell session on this home theater PC.
# Shares movie files for playback using the existing Windows account.
$ErrorActionPreference = 'Stop'
$shareName = 'Movies'
$moviePath = 'D:\Media\Movies'
$reader = 'MEDIA-PC\media-reader'
$homeInterface = 'Ethernet'
$firewallName = 'HomeTheater-Movies-SMB-In'
$createdShare = $false
$createdRule = $false

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this script as a Windows administrator.'
    }
    if ($env:COMPUTERNAME -ne 'MEDIA-PC') {
        throw 'This script is configured for MEDIA-PC.'
    }
    if (-not (Test-Path -LiteralPath $moviePath -PathType Container)) {
        throw "Movie folder does not exist: $moviePath"
    }
    $profile = Get-NetConnectionProfile -InterfaceAlias $homeInterface
    if ($profile.NetworkCategory -ne 'Private') {
        throw 'The home Ethernet connection must already be marked Private.'
    }
    if (Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue) {
        throw 'A Movies share already exists; inspect it before making changes.'
    }
    if (Get-NetFirewallRule -Name $firewallName -ErrorAction SilentlyContinue) {
        throw 'The Movies firewall rule already exists; inspect it before making changes.'
    }
    if ((Get-Service LanmanServer).Status -ne 'Running') {
        throw 'The Windows Server service must be running.'
    }
    if (-not (Get-SmbServerConfiguration).EnableSMB2Protocol) {
        throw 'SMB2/SMB3 must be enabled before creating the share.'
    }

    New-SmbShare -Name $shareName -Path $moviePath -ReadAccess $reader `
        -CachingMode None -FolderEnumerationMode AccessBased `
        -Description 'Home theater movies - read-only playback' | Out-Null
    $createdShare = $true

    New-NetFirewallRule -Name $firewallName -DisplayName 'Home theater Movies SMB' `
        -Direction Inbound -Action Allow -Enabled True -Profile Private `
        -InterfaceAlias $homeInterface -Protocol TCP -LocalPort 445 `
        -RemoteAddress LocalSubnet | Out-Null
    $createdRule = $true

    Get-SmbShare -Name $shareName | Select-Object Name, Path, ShareState
    Get-SmbShareAccess -Name $shareName
    Write-Host "Movie share ready: \\$env:COMPUTERNAME\$shareName"
    exit 0
}
catch {
    # Undo only resources created by this invocation if setup fails.
    if ($createdRule) {
        Remove-NetFirewallRule -Name $firewallName -ErrorAction Continue
    }
    if ($createdShare) {
        Remove-SmbShare -Name $shareName -Force -ErrorAction Continue
    }
    Write-Error $_ -ErrorAction Continue
    exit 1
}
