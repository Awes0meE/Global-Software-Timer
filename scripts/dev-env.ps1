$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path $cargoBin) {
    $env:PATH = "$cargoBin;$env:PATH"
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $vsInstall = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($vsInstall) {
        $vcVars = Join-Path $vsInstall "VC\Auxiliary\Build\vcvars64.bat"
        if (Test-Path $vcVars) {
            cmd /c "`"$vcVars`" >nul && set" | ForEach-Object {
                $name, $value = $_ -split "=", 2
                if ($name -and $value) {
                    Set-Item -Path "Env:$name" -Value $value
                }
            }
        }
    }
}

Write-Host "Development environment ready."
Write-Host "Node: $(node --version)"
Write-Host "npm: $(npm --version)"
Write-Host "Rust: $(rustc --version)"
Write-Host "Cargo: $(cargo --version)"
