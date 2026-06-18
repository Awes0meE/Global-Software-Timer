$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

. "$PSScriptRoot\dev-env.ps1"

npm.cmd run check
npm.cmd run tauri:build

$package = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $repoRoot "package.json") | ConvertFrom-Json
$version = $package.version
$staging = Join-Path $repoRoot "release-staging"
New-Item -ItemType Directory -Force -Path $staging | Out-Null

$setupSource = Join-Path $repoRoot "src-tauri\target\release\bundle\nsis\Global Software Timer_${version}_x64-setup.exe"
$msiSource = Join-Path $repoRoot "src-tauri\target\release\bundle\msi\Global Software Timer_${version}_x64_en-US.msi"
$setupTarget = Join-Path $staging "Global.Software.Timer_${version}_x64-setup.exe"
$msiTarget = Join-Path $staging "Global.Software.Timer_${version}_x64_en-US.msi"

Copy-Item -LiteralPath $setupSource -Destination $setupTarget -Force
Copy-Item -LiteralPath $msiSource -Destination $msiTarget -Force

Get-ChildItem -LiteralPath $staging | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
Get-FileHash -Algorithm SHA256 -LiteralPath $setupTarget, $msiTarget | Format-Table -AutoSize
