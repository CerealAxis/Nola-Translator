$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$target = [IO.Path]::GetFullPath((Join-Path $projectRoot 'vendor\llama-cpu'))
$cacheRoot = Join-Path $projectRoot 'vendor\llama-zips'
$archive = Join-Path $cacheRoot 'llama-b11211-bin-win-cpu-x64.zip'
# Pinned to the SHA-256 published on the upstream b11211 release assets page.
$expectedHash = '4523850c6d869ebe0642cf5ad9a26578a3ddc60f544f085562ee9bce3084ed99'
$marker = Join-Path $target 'nola-runtime-source.txt'
if ((Test-Path -LiteralPath $marker) -and (Get-Content -LiteralPath $marker -Raw).Trim() -eq $expectedHash -and (Test-Path -LiteralPath (Join-Path $target 'llama-server.exe'))) {
    Write-Output 'CPU llama.cpp 已准备完成。'
    exit 0
}
if (Test-Path -LiteralPath $target) { throw 'CPU llama 目录已存在但来源不匹配；请先检查该目录，构建脚本不会替换它。' }
New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
if ((Test-Path -LiteralPath $archive) -and (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
    Remove-Item -LiteralPath $archive -Force
}
if (-not (Test-Path -LiteralPath $archive)) {
    $part = "$archive.part"
    Invoke-WebRequest -Uri 'https://github.com/ggml-org/llama.cpp/releases/download/b11211/llama-b11211-bin-win-cpu-x64.zip' -OutFile $part
    if ((Get-FileHash -LiteralPath $part -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'CPU llama 下载校验失败' }
    Move-Item -LiteralPath $part -Destination $archive
}
$staging = "$target.staging-$([Guid]::NewGuid().ToString('N'))"
$vendorPrefix = [IO.Path]::GetFullPath((Join-Path $projectRoot 'vendor')).TrimEnd('\') + '\'
if (-not [IO.Path]::GetFullPath($staging).StartsWith($vendorPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'CPU llama 暂存路径越界' }
try {
    & (Join-Path $PSScriptRoot 'extract-runtime.ps1') -Archive $archive -Destination $staging
    if (-not (Test-Path -LiteralPath (Join-Path $staging 'llama-server.exe'))) { throw 'CPU llama 运行包不完整' }
    Set-Content -LiteralPath (Join-Path $staging 'nola-runtime-source.txt') -Value $expectedHash -Encoding ASCII
    Move-Item -LiteralPath $staging -Destination $target
} finally {
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
}
Write-Output "CPU llama.cpp 已准备完成：$target"
