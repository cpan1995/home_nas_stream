# Run with Windows PowerShell. WSL is mocked; this never launches the app.
$ErrorActionPreference = 'Stop'
$launcher = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\launch-wsl.ps1'
function global:wsl.exe {
    $global:capturedArguments = @($args)
    $global:LASTEXITCODE = 0
}
function Assert-Launch($Project, $Distribution, $Mode, $Action, $Expected) {
    $env:SCREENING_ROOM_PROJECT_DIR = $Project
    $env:SCREENING_ROOM_WSL_DISTRO = $Distribution
    & $launcher -Mode $Mode -Action $Action
    $actual = ConvertTo-Json -Compress -InputObject $global:capturedArguments
    $wanted = ConvertTo-Json -Compress -InputObject $Expected
    if ($actual -ne $wanted) { throw "Expected $wanted; received $actual" }
}
$oldProject = $env:SCREENING_ROOM_PROJECT_DIR
$oldDistribution = $env:SCREENING_ROOM_WSL_DISTRO
try {
    Assert-Launch 'C:\Apps\Movie Room' '' 'directory' '' @('--cd', 'C:\Apps\Movie Room', '--', 'bash', 'scripts/start-pi.sh')
    Assert-Launch '\\wsl.localhost\Ubuntu\apps\Movie Room' '' 'cinepro' '' @('--distribution', 'Ubuntu', '--cd', '/apps/Movie Room', '--', 'bash', 'scripts/start-pi.sh', '--cinepro')
    Assert-Launch '\\wsl$\Debian\apps\Movies' '' 'directory' '--check' @('--distribution', 'Debian', '--cd', '/apps/Movies', '--', './build/screening-room', '--help')
    Assert-Launch '/apps/Movies' 'Debian' 'cinepro' '--check' @('--distribution', 'Debian', '--cd', '/apps/Movies', '--', 'node', 'scripts/cinepro-launch.mjs', '--ui-only')
    Assert-Launch '\\wsl.localhost\Ubuntu\apps\Movies' 'Custom' 'directory' '' @('--distribution', 'Custom', '--cd', '/apps/Movies', '--', 'bash', 'scripts/start-pi.sh')
    $env:SCREENING_ROOM_PROJECT_DIR = ''
    $env:SCREENING_ROOM_WSL_DISTRO = ''
    & $launcher
    if ($global:capturedArguments[-1] -ne 'scripts/start-pi.sh') { throw 'Automatic checkout launch failed' }
    foreach ($file in @($launcher, (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\setup-movies-share.ps1'))) {
        $tokens = $null
        $errors = $null
        [void][System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors)
        if ($errors.Count) { throw ($errors | Out-String) }
    }
    Write-Output 'PASS: six Windows launch cases and PowerShell syntax checks'
} finally {
    $env:SCREENING_ROOM_PROJECT_DIR = $oldProject
    $env:SCREENING_ROOM_WSL_DISTRO = $oldDistribution
    Remove-Item Function:\wsl.exe
}
