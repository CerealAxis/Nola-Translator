$ErrorActionPreference = 'Stop'

npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Node dependency installation failed' }

if (-not (Test-Path "$PSScriptRoot\..\node_modules\electron\dist\electron.exe")) {
    npm exec -- install-electron
    if ($LASTEXITCODE -ne 0) { throw 'Electron installation failed' }
}
