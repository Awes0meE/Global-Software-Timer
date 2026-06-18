$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

. "$PSScriptRoot\dev-env.ps1"

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Command,
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]] $Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}

npm.cmd test
if ($LASTEXITCODE -ne 0) { throw "npm.cmd test failed with exit code $LASTEXITCODE" }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "npm.cmd run build failed with exit code $LASTEXITCODE" }
Invoke-CheckedCommand cargo fmt --manifest-path src-tauri\Cargo.toml -- --check
Invoke-CheckedCommand cargo test --manifest-path src-tauri\Cargo.toml
npm.cmd audit --audit-level=moderate
if ($LASTEXITCODE -ne 0) { throw "npm.cmd audit failed with exit code $LASTEXITCODE" }
