$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$target = [IO.Path]::GetFullPath((Join-Path $projectRoot 'vendor\llama-cpu'))
$cacheRoot = Join-Path $projectRoot 'vendor\llama-zips'
$catalog = Get-Content -LiteralPath (Join-Path $projectRoot 'build\runtime-catalog.json') -Raw | ConvertFrom-Json
$packages = @($catalog.packages | Where-Object {
    $_.kind -eq 'llama' -and $_.architecture -eq 'x64' -and $_.backend -eq 'cpu'
})
if ($packages.Count -ne 1) { throw '运行时清单必须包含唯一的 Windows x64 CPU llama 包。' }
$package = $packages[0]
$sourceAssets = @($package) + @($package.companions)
$assets = @($sourceAssets | Where-Object { $null -ne $_ } | ForEach-Object {
    if (-not $_.url -or $_.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'llama 运行时清单中的下载地址或 SHA-256 无效。' }
    @{
        Archive = Join-Path $cacheRoot ([IO.Path]::GetFileName(([Uri]$_.url).AbsolutePath))
        Url     = $_.url
        Sha256  = $_.sha256.ToLowerInvariant()
    }
})
$expectedSource = ($assets | ForEach-Object { $_.Sha256 }) -join ':'
$marker = Join-Path $target 'nola-runtime-source.txt'
if ((Test-Path -LiteralPath $marker) -and (Get-Content -LiteralPath $marker -Raw).Trim() -eq $expectedSource -and (Test-Path -LiteralPath (Join-Path $target 'llama-server.exe'))) {
    Write-Output 'CPU llama.cpp 已准备完成。'
    exit 0
}
if (Test-Path -LiteralPath $target) { throw 'CPU llama 目录已存在但来源不匹配或文件不完整；请先检查并移走 vendor/llama-cpu 后重新运行，脚本不会替换它。' }
New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
foreach ($asset in $assets) {
    $archive = $asset.Archive
    $expectedHash = $asset.Sha256
    if ((Test-Path -LiteralPath $archive) -and (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
        Remove-Item -LiteralPath $archive -Force
    }
    if (-not (Test-Path -LiteralPath $archive)) {
        $part = "$archive.part"
        Invoke-WebRequest -Uri $asset.Url -OutFile $part
        if ((Get-FileHash -LiteralPath $part -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'CPU llama 下载校验失败' }
        Move-Item -LiteralPath $part -Destination $archive
    }
}
$staging = "$target.staging-$([Guid]::NewGuid().ToString('N'))"
$vendorPrefix = [IO.Path]::GetFullPath((Join-Path $projectRoot 'vendor')).TrimEnd('\') + '\'
if (-not [IO.Path]::GetFullPath($staging).StartsWith($vendorPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'CPU llama 暂存路径越界' }
try {
    & (Join-Path $PSScriptRoot 'extract-runtime.ps1') -Archive $assets[0].Archive -Destination $staging
    for ($index = 1; $index -lt $assets.Count; $index++) {
        $companionStaging = Join-Path $staging ".nola-companion-$index"
        try {
            & (Join-Path $PSScriptRoot 'extract-runtime.ps1') -Archive $assets[$index].Archive -Destination $companionStaging
            Get-ChildItem -LiteralPath $companionStaging -Force | Move-Item -Destination $staging -Force
        } finally {
            if (Test-Path -LiteralPath $companionStaging) { Remove-Item -LiteralPath $companionStaging -Recurse -Force }
        }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $staging 'llama-server.exe'))) { throw 'CPU llama 运行包不完整' }
    Set-Content -LiteralPath (Join-Path $staging 'nola-runtime-source.txt') -Value $expectedSource -Encoding ASCII
    Move-Item -LiteralPath $staging -Destination $target
} finally {
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
}
Write-Output "CPU llama.cpp 已准备完成：$target"
