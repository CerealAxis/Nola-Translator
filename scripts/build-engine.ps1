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
    --name FluentCaptionsEngine `
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
    --collect-all sherpa_onnx `
    --collect-all faster_whisper `
    --collect-all ctranslate2 `
    --collect-all onnxruntime `
    --collect-all minisbd `
    --collect-data argostranslate `
    --hidden-import argostranslate.package `
    --hidden-import argostranslate.translate `
    --hidden-import argostranslate.sbd `
    --hidden-import argostranslate.settings `
    --hidden-import argostranslate.networking `
    --hidden-import argostranslate.models `
    --hidden-import argostranslate.apis `
    --hidden-import argostranslate.fewshot `
    --exclude-module stanza `
    --exclude-module spacy `
    --exclude-module torch `
    --hidden-import pyaudiowpatch `
    (Join-Path $engineRoot 'engine_entry.py')
