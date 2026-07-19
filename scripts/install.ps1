$ErrorActionPreference = 'Stop'

$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm install --no-audit --no-fund

if (-not (Test-Path "$PSScriptRoot\..\node_modules\electron\dist\electron.exe")) {
    npm exec -- install-electron
}
