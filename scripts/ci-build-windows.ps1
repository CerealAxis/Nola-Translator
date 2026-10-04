param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
function Assert-NativeSuccess([string]$Task) {
    if ($LASTEXITCODE -ne 0) { throw "$Task failed (exit $LASTEXITCODE)" }
}

# npm lifecycle policy can skip Electron's postinstall on a clean runner. The
# package's own installer also handles an already-installed matching version.
& node node_modules/electron/install.js
Assert-NativeSuccess 'Prepare Electron binary'
& node -e 'const fs=require("node:fs"); const p=require("electron/package.json"); const v=fs.readFileSync("node_modules/electron/dist/version","utf8").trim().replace(/^v/,""); if(v!==p.version || !fs.existsSync("node_modules/electron/dist/electron.exe")) throw new Error("Electron Windows binary is missing or has the wrong version"); console.log("Electron binary ready: "+v);'
Assert-NativeSuccess 'Check Electron binary'

& npm run build
Assert-NativeSuccess 'Application build'
$basePython = (& python -c 'import sys; print(sys.executable)').Trim()
Assert-NativeSuccess 'Locate Python'
& "$PSScriptRoot/build-cpu-engine.ps1" -BasePython $basePython
& "$PSScriptRoot/fetch-llama-cpu.ps1"
# Publishing is handled by the release workflow, never by electron-builder.
& npx --no-install electron-builder --win nsis --x64 --publish never
Assert-NativeSuccess 'Installer packaging'

$installers = @(Get-ChildItem -LiteralPath 'release' -Filter '*-Setup-x64.exe' -File)
if ($installers.Count -ne 1) { throw 'Expected exactly one Windows x64 installer' }
$checksum = foreach ($file in $installers) {
    "$((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant())  $($file.Name)"
}
Set-Content -LiteralPath 'release/SHA256SUMS.txt' -Value $checksum -Encoding ascii
