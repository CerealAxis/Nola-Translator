$ErrorActionPreference = 'Stop'

# The companion assets supply cudart and cuBLAS for the CUDA backend.

$projectRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $projectRoot 'vendor\llama'
$cacheDir = Join-Path $projectRoot 'vendor\llama-zips'

$catalog = Get-Content -LiteralPath (Join-Path $projectRoot 'build\runtime-catalog.json') -Raw | ConvertFrom-Json
$packages = @($catalog.packages | Where-Object {
    $_.kind -eq 'llama' -and $_.architecture -eq 'x64' -and $_.backend -eq 'cuda' -and $_.url -like '*-cuda-12.4-*'
})
if ($packages.Count -ne 1) { throw '运行时清单必须包含唯一的 Windows x64 CUDA 12.4 llama 包。' }
$package = $packages[0]
$sourceAssets = @($package) + @($package.companions)
$assets = @($sourceAssets | Where-Object { $null -ne $_ } | ForEach-Object {
    if (-not $_.url -or $_.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'llama 运行时清单中的下载地址或 SHA-256 无效。' }
    @{
        Name   = [IO.Path]::GetFileName(([Uri]$_.url).AbsolutePath)
        Url    = $_.url
        Sha256 = $_.sha256.ToLowerInvariant()
    }
})
$expectedSource = ($assets | ForEach-Object { $_.Sha256 }) -join ':'
$marker = Join-Path $targetDir 'nola-runtime-source.txt'

$requiredFiles = @(
    'llama-server.exe',
    'llama-server-impl.dll',
    'ggml.dll',
    'ggml-cuda.dll',
    'cublas64_12.dll',
    'cublasLt64_12.dll',
    'cudart64_12.dll'
)

$present = ($requiredFiles | Where-Object { -not (Test-Path (Join-Path $targetDir $_)) }).Count -eq 0
if ($present -and (Test-Path -LiteralPath $marker) -and (Get-Content -LiteralPath $marker -Raw).Trim() -eq $expectedSource) {
    Write-Host "vendor/llama 已包含清单对应的 llama-server 与 CUDA 运行时，跳过下载。"
    exit 0
}
if (Test-Path -LiteralPath $targetDir) {
    throw 'CUDA llama 目录已存在但来源不匹配或文件不完整；请先检查并移走 vendor/llama 后重新运行，脚本不会替换它。'
}

New-Item -ItemType Directory -Force -Path $targetDir, $cacheDir | Out-Null

foreach ($asset in $assets) {
    $zipPath = Join-Path $cacheDir $asset.Name

    $verified = $false
    if (Test-Path $zipPath) {
        $hash = (Get-FileHash -Algorithm SHA256 -Path $zipPath).Hash.ToLowerInvariant()
        $verified = $hash -eq $asset.Sha256
        if (-not $verified) {
            Remove-Item -Force $zipPath
            Write-Host "$($asset.Name) 校验失败，重新下载。"
        }
    }

    if (-not $verified) {
        $partPath = "$zipPath.part"
        Write-Host "下载 $($asset.Name) ..."
        Invoke-WebRequest -Uri $asset.Url -OutFile $partPath

        $hash = (Get-FileHash -Algorithm SHA256 -Path $partPath).Hash.ToLowerInvariant()
        if ($hash -ne $asset.Sha256) {
            Remove-Item -Force $partPath
            throw "$($asset.Name) sha256 校验失败：期望 $($asset.Sha256)，实际 $hash"
        }
        Move-Item -Force -Path $partPath -Destination $zipPath
    }

    Write-Host "解压 $($asset.Name) 到 vendor/llama ..."
    Expand-Archive -Path $zipPath -DestinationPath $targetDir -Force
}

foreach ($file in $requiredFiles) {
    if (-not (Test-Path (Join-Path $targetDir $file))) {
        throw "解压后缺少 $file，vendor/llama 不完整。"
    }
}

Set-Content -LiteralPath $marker -Value $expectedSource -Encoding ASCII
Write-Host "llama.cpp $($package.version) 运行时已就绪：$targetDir"
