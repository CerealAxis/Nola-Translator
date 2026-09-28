$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'

if (-not (Test-Path $venvPython)) {
    python -m venv (Join-Path $projectRoot '.venv')
}

# 钉下 CUDA 版 torch：必须在可编辑安装之前，避免可编辑安装解析出 CPU 构建替换 CUDA 版。
& $venvPython -m pip install `
    --index-url 'https://download.pytorch.org/whl/cu126' `
    'torch==2.13.0'

& $venvPython -m pip install `
    --editable "$projectRoot\engine[dev]"
