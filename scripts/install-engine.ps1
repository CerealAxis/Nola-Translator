$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'

if (-not (Test-Path $venvPython)) {
    python -m venv (Join-Path $projectRoot '.venv')
}

# Pin the CUDA build of torch before the editable install; otherwise pip resolves a CPU build over it.
& $venvPython -m pip install `
    --index-url 'https://download.pytorch.org/whl/cu126' `
    'torch==2.13.0'

& $venvPython -m pip install `
    --editable "$projectRoot\engine[dev]"
