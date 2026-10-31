param(
    [Parameter(Mandatory=$true)][string]$Fleet,
    [switch]$SharedPassword
)
$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath $Fleet -Raw | ConvertFrom-Json
if ($manifest.policy -ne 'custom-adapted-foul-play-baseline') { throw 'Expected a baseline fleet manifest.' }
$previous = @{}
try {
    if ($SharedPassword) {
        $secret = Read-Host 'Shared password for the listed bot accounts' -AsSecureString
        $shared = [System.Net.NetworkCredential]::new('', $secret).Password
    }
    foreach ($account in $manifest.accounts) {
        $name = [string]$account.passwordEnv
        if ($name -notmatch '^FOULPLAY_[A-Z0-9]+_PASSWORD$') { throw 'Unexpected password variable name.' }
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        if ($SharedPassword) { $password = $shared }
        else {
            $secret = Read-Host "Password for $($account.username)" -AsSecureString
            $password = [System.Net.NetworkCredential]::new('', $secret).Password
        }
        [Environment]::SetEnvironmentVariable($name, $password, 'Process')
    }
    & node (Join-Path $PSScriptRoot 'start-foul-play-fleet.cjs') $Fleet
    if ($LASTEXITCODE -ne 0) { throw "Fleet process exited with code $LASTEXITCODE" }
} finally {
    foreach ($name in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
    $shared = $null; $password = $null; $secret = $null
}
