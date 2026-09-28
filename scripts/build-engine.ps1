$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'
$engineRoot = Join-Path $projectRoot 'engine'
$systemDirectory = Join-Path $env:SystemRoot 'System32'

if (-not (Test-Path $python)) {
    throw '未找到项目 Python 环境，请先运行 .\scripts\install-engine.ps1'
}

& $python -m PyInstaller `
    --noconfirm `
    --clean `
    --onedir `
    --name NolaTranslatorEngine `
    --distpath (Join-Path $engineRoot 'dist') `
    --workpath (Join-Path $engineRoot 'build') `
    --specpath (Join-Path $engineRoot 'build') `
    --paths $engineRoot `
    --add-binary "$systemDirectory\concrt140.dll;." `
    --add-binary "$systemDirectory\msvcp140.dll;." `
    --add-binary "$systemDirectory\msvcp140_1.dll;." `
    --add-binary "$systemDirectory\msvcp140_2.dll;." `
    --add-binary "$systemDirectory\msvcp140_atomic_wait.dll;." `
    --add-binary "$systemDirectory\msvcp140_codecvt_ids.dll;." `
    --add-binary "$systemDirectory\vcruntime140.dll;." `
    --add-binary "$systemDirectory\vcruntime140_1.dll;." `
    --add-binary "$systemDirectory\vcruntime140_threads.dll;." `
    --collect-all torch `
    --collect-all transformers `
    --collect-all bitsandbytes `
    --collect-all accelerate `
    --collect-all sentencepiece `
    --hidden-import pyaudiowpatch `
    (Join-Path $engineRoot 'engine_entry.py')
