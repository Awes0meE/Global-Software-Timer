$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'release-build.ps1'
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ('gst-release-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
Copy-Item -LiteralPath $source -Destination (Join-Path $fixture 'release-build.ps1')
Set-Content -LiteralPath (Join-Path $fixture 'dev-env.ps1') -Value ''
$originalLocation = Get-Location
try {
    foreach ($failure in @('check', 'tauri:build')) {
        $global:gstFailure = $failure
        $global:gstCalls = @()
        function global:npm.cmd {
            param([string] $verb, [string] $task)
            $global:gstCalls += $task
            $global:gstArgs = @($args)
            $global:LASTEXITCODE = if ($task -eq $global:gstFailure) { 17 } else { 0 }
        }
        $caught = $null
        try { & (Join-Path $fixture 'release-build.ps1') } catch { $caught = $_ }
        if (-not $caught -or $caught.ToString() -notlike "*npm.cmd run $failure failed with exit code 17*") {
            throw "Release did not stop at $failure with its exit code: $caught"
        }
        $expected = if ($failure -eq 'check') { 'check' } else { 'check,tauri:build' }
        if (($global:gstCalls -join ',') -ne $expected) { throw 'Unexpected command ran after failure' }
        'PASS: stops after ' + $failure
    }
    # -Updater merges the updater config into the build; a plain build passes no extra arguments. (This
    # stand-in is a PowerShell function, which drops the `--` that the real npm.cmd receives.)
    foreach ($updater in @($false, $true)) {
        $global:gstFailure = 'tauri:build'
        $global:gstCalls = @()
        $global:gstArgs = @()
        try { & (Join-Path $fixture 'release-build.ps1') -Updater:$updater } catch {}
        $expected = if ($updater) { '--config src-tauri/tauri.updater.conf.json' } else { '' }
        if (($global:gstArgs -join ' ') -ne $expected) { throw "Unexpected tauri:build arguments: $($global:gstArgs -join ' ')" }
        'PASS: tauri:build arguments with -Updater:' + $updater
    }
} finally {
    Set-Location $originalLocation
    Remove-Item Function:\npm.cmd -ErrorAction SilentlyContinue
    Remove-Variable gstFailure,gstCalls,gstArgs -Scope Global -ErrorAction SilentlyContinue
    $resolved = [System.IO.Path]::GetFullPath($fixture)
    $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if (-not $resolved.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe fixture path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
