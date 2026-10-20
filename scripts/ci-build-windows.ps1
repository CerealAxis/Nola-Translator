param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
. (Join-Path $PSScriptRoot 'sha256.ps1')

# PowerShell 7 puts its own module directories at the front of PSModulePath and passes that
# environment on to the processes it starts. A child Windows PowerShell then looks for the
# modules it knows in the PowerShell 7 directory first, cannot load them there and never
# falls back to its own copy, so cmdlets such as Get-FileHash disappear from the child.
# The Windows PowerShell module directory is put in front of the inherited path so every
# `powershell` script this build starts resolves its modules the way it expects.
$windowsPowerShellModules = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules'
if (Test-Path -LiteralPath $windowsPowerShellModules) {
    $env:PSModulePath = "$windowsPowerShellModules;$env:PSModulePath"
}

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
& npm run build:browser
Assert-NativeSuccess 'Browser extension build'
& npm run package:browser
Assert-NativeSuccess 'Browser extension archive'
# The Vulkan llama runtime is not in the repository, so a clean checkout has no vendor directory
# and the packaged application would ship without the local translation runtime.
& npm run fetch:llama-vulkan
Assert-NativeSuccess 'Vulkan llama runtime'
$basePython = (& python -c 'import sys; print(sys.executable)').Trim()
Assert-NativeSuccess 'Locate Python'
$hostEnvironment = Join-Path (Get-Location).Path 'artifacts/browser-host-environment'
& $basePython -m venv $hostEnvironment
Assert-NativeSuccess 'Create browser host build environment'
$hostPython = Join-Path $hostEnvironment 'Scripts/python.exe'
# Keep the host build tool aligned with the engine's declared development dependency.
$pyInstallerOutput = & $basePython -c 'import tomllib; from pathlib import Path; deps = tomllib.loads(Path("engine/pyproject.toml").read_bytes().decode("utf-8"))["project"]["optional-dependencies"]["dev"]; print(next(dep for dep in deps if dep.startswith("pyinstaller==")))'
Assert-NativeSuccess 'Locate PyInstaller requirement'
$pyInstallerRequirement = ($pyInstallerOutput -join "`n").Trim()
if (-not $pyInstallerRequirement) { throw 'PyInstaller requirement is missing' }
& $hostPython -m pip install $pyInstallerRequirement
Assert-NativeSuccess 'Install browser host build tool'
& "$PSScriptRoot/build-browser-host.ps1" -Python $hostPython
& "$PSScriptRoot/build-python-base.ps1" -BasePython $basePython
# Build separate x64 EXE and MSI installers.
& node "$PSScriptRoot/ci-package-config.cjs"
Assert-NativeSuccess 'Generate packaging configuration'
& npx --no-install electron-builder --config artifacts/ci-builder.json --win nsis msi --x64 --publish never
Assert-NativeSuccess 'Installer packaging'

$buildVersion = (Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
$distributionPrefix = "Nola-Translator-$buildVersion"
$assets = @()
foreach ($arch in @('x64')) {
    foreach ($extension in @('exe', 'msi')) {
        $name = "$distributionPrefix-Windows-$arch-Setup.$extension"
        if (-not (Test-Path -LiteralPath "release/$name")) { throw "Missing installer: $name" }
        $assets += $name
    }
}
$sourceName = "$distributionPrefix-Source.zip"
& git archive --format=zip "--prefix=$distributionPrefix-Source/" "--output=release/$sourceName" HEAD
Assert-NativeSuccess 'Source archive'
$assets += $sourceName
$browserVersion = (Get-Content -LiteralPath 'browser/version.json' -Raw | ConvertFrom-Json).version
$extensionOutputs = @()
foreach ($browser in @('Chrome', 'Edge')) {
    $name = "Nola-$browser-Extension-v$browserVersion.zip"
    if (-not (Test-Path -LiteralPath "release/$name")) { throw "Missing browser extension: $name" }
    $assets += $name
    $extensionOutputs += "$($browser.ToLowerInvariant())-extension=release/$name"
}
$checksum = foreach ($name in $assets) {
    $file = Get-Item -LiteralPath "release/$name"
    "$(Get-Sha256Hex $file.FullName)  $($file.Name)"
}
Set-Content -LiteralPath 'release/SHA256SUMS.txt' -Value $checksum -Encoding ascii
if ($env:GITHUB_OUTPUT) {
    Add-Content -LiteralPath $env:GITHUB_OUTPUT -Encoding utf8 -Value (@(
        "exe-x64=release/$distributionPrefix-Windows-x64-Setup.exe",
        "msi-x64=release/$distributionPrefix-Windows-x64-Setup.msi",
        "source=release/$sourceName"
    ) + $extensionOutputs)
}
if ($env:GITHUB_STEP_SUMMARY) {
    Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Value @(
        '## Downloads', '', '| File | SHA-256 |', '| --- | --- |'
    )
    foreach ($line in $checksum) {
        $parts = $line -split '  ', 2
        Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Value "| $($parts[1]) | $($parts[0]) |"
    }
}
