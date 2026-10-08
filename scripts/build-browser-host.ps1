param([string]$Python = '.venv\Scripts\python.exe')
$ErrorActionPreference = 'Stop'
$Workspace = Split-Path -Parent $PSScriptRoot
Push-Location $Workspace
try {
    & $Python -m PyInstaller --noconfirm --clean --onefile --name NolaBrowserHost --distpath artifacts/browser-host --workpath artifacts/browser-host-build --specpath artifacts/browser-host-build browser/native_host/host.py
    if ($LASTEXITCODE -ne 0) { throw 'Native host build failed' }
} finally { Pop-Location }
