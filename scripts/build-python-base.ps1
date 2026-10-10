param([string]$BasePython)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $BasePython) {
    $BasePython = Join-Path $projectRoot 'artifacts\python312\tools\python.exe'
    if (-not (Test-Path -LiteralPath $BasePython)) { $BasePython = Join-Path $projectRoot '.venv\Scripts\python.exe' }
}
if (-not (Test-Path -LiteralPath $BasePython)) { throw 'Specify a Windows x64 Python 3.12 interpreter with -BasePython' }
& $BasePython -c "import sys,struct; assert sys.version_info[:2] == (3,12) and struct.calcsize('P') == 8, 'Windows x64 Python 3.12 is required'"
if ($LASTEXITCODE -ne 0) { throw 'Python base version mismatch' }
$buildEnvironment = Join-Path $projectRoot 'artifacts\runtime-build\base312'
$buildPython = Join-Path $buildEnvironment 'Scripts\python.exe'
if (-not (Test-Path -LiteralPath $buildPython)) {
    & $BasePython -m venv $buildEnvironment
    if ($LASTEXITCODE -ne 0) { throw 'Could not create Python build environment' }
}
$previousPipConfig = $env:PIP_CONFIG_FILE
try {
    $env:PIP_CONFIG_FILE = 'nul'
    & $buildPython -m pip --isolated install --index-url 'https://pypi.org/simple' -r (Join-Path $projectRoot 'engine\requirements-base.txt')
} finally { $env:PIP_CONFIG_FILE = $previousPipConfig }
if ($LASTEXITCODE -ne 0) { throw 'Could not install base dependencies' }
& $buildPython (Join-Path $PSScriptRoot 'build-python-runtime.py')
if ($LASTEXITCODE -ne 0) { throw 'Python runtime build failed' }
$privatePython = Join-Path $projectRoot 'engine\dist\NolaPythonEngine\python.exe'
& $privatePython -I -c "import sys,importlib.util; import nola_translator_engine.runtime; assert sys.version_info[:2] == (3,12); assert importlib.util.find_spec('torch') is None"
if ($LASTEXITCODE -ne 0) { throw 'Base runtime must work without Torch' }
