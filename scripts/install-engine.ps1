param(
    [ValidateSet('cpu', 'cuda')][string]$Backend = 'cuda',
    [string]$EnvironmentPath,
    [switch]$RuntimeOnly
)
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $EnvironmentPath) { $EnvironmentPath = Join-Path $projectRoot '.venv' }
$venvPython = Join-Path $EnvironmentPath 'Scripts\python.exe'

if (-not (Test-Path $venvPython)) {
    python -m venv $EnvironmentPath
    if ($LASTEXITCODE -ne 0) { throw '创建 Python 环境失败' }
}

# Each build environment contains exactly one selected torch backend.
$torchIndex = if ($Backend -eq 'cpu') { 'https://download.pytorch.org/whl/cpu' } else { 'https://download.pytorch.org/whl/cu126' }
& $venvPython -m pip install `
    --index-url $torchIndex `
    --force-reinstall `
    'torch==2.13.0'
if ($LASTEXITCODE -ne 0) { throw '安装 PyTorch 失败' }

$engineRequirement = if ($RuntimeOnly) { "$projectRoot\engine" } else { "$projectRoot\engine[dev]" }
if ($RuntimeOnly) {
    & $venvPython -m pip install $engineRequirement
} else {
    & $venvPython -m pip install --editable $engineRequirement
}
if ($LASTEXITCODE -ne 0) { throw '安装引擎依赖失败' }
