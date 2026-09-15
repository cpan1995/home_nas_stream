#Requires -RunAsAdministrator
param(
    [Parameter(Mandatory=$true)]
    [ValidatePattern('^([0-9]{1,3}\.){3}[0-9]{1,3}/([1-9]|[12][0-9]|3[0-2])$')]
    [string]$Subnet,
    [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$vm = '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}'
foreach ($entry in @(@{Suffix='Control';Protocol='TCP';Port=8060}, @{Suffix='Discovery';Protocol='UDP';Port=1900})) {
    $name = 'ScreeningRoom-WSL-' + $entry.Suffix
    if ($Remove) {
        Get-NetFirewallHyperVRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallHyperVRule
        Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
        continue
    }
    if (!(Get-NetFirewallHyperVRule -Name $name -ErrorAction SilentlyContinue)) {
        New-NetFirewallHyperVRule -Name $name -DisplayName ('Screening Room ' + $entry.Suffix) -Direction Inbound -VMCreatorId $vm -Protocol $entry.Protocol -LocalPorts $entry.Port -RemoteAddresses $Subnet -Profiles Private -Action Allow | Out-Null
    }
    if (!(Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name $name -DisplayName ('Screening Room ' + $entry.Suffix) -Direction Inbound -Protocol $entry.Protocol -LocalPort $entry.Port -RemoteAddress $Subnet -Profile Private -Action Allow | Out-Null
    }
}
Write-Output 'Screening Room firewall configuration complete.'
