param([string]$BasePython)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $BasePython) { $BasePython = Join-Path $projectRoot '.venv\Scripts\python.exe' }
if (-not (Test-Path -LiteralPath $BasePython)) { throw '请指定用于构建的 Python 3.13 解释器' }
& $BasePython -c 'import sys, struct; assert sys.version_info[:2] == (3, 13) and struct.calcsize("P") == 8, "Windows x64 Python 3.13 is required"'
if ($LASTEXITCODE -ne 0) { throw 'CPU 发行环境需要 x64 Python 3.13' }
$buildEnvironment = Join-Path $projectRoot 'artifacts\runtime-build\cpu'
$cpuPython = Join-Path $buildEnvironment 'Scripts\python.exe'
if (-not (Test-Path -LiteralPath $cpuPython)) {
    & $BasePython -m venv $buildEnvironment
    if ($LASTEXITCODE -ne 0) { throw '创建 CPU 构建环境失败' }
}
& (Join-Path $PSScriptRoot 'install-engine.ps1') -Backend cpu -EnvironmentPath $buildEnvironment -RuntimeOnly
& $cpuPython -c 'import torch; assert torch.version.cuda is None and torch.version.hip is None, "CPU build contains GPU torch"'
if ($LASTEXITCODE -ne 0) { throw 'CPU 构建环境的后端不匹配' }
& $cpuPython (Join-Path $PSScriptRoot 'build-python-runtime.py')
if ($LASTEXITCODE -ne 0) { throw '受管 CPU Python 环境构建失败' }
$privatePython = Join-Path $projectRoot 'engine\dist\NolaPythonEngine\python.exe'
$previousProbe = $env:NOLA_TRANSLATOR_RUNTIME_PROBE
try {
    $env:NOLA_TRANSLATOR_RUNTIME_PROBE = '1'
    $probeOutput = & $privatePython -I -m nola_translator_engine
    if ($LASTEXITCODE -ne 0) { throw '私有 Python 环境导入检查失败' }
    $probe = ($probeOutput -join "`n") | ConvertFrom-Json
    if ($probe.backend -ne 'cpu') { throw '私有 Python 环境不是 CPU 基线' }
    Write-Output '私有 CPU Python 环境已构建并完成导入检查。'
} finally {
    $env:NOLA_TRANSLATOR_RUNTIME_PROBE = $previousProbe
}
