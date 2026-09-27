$ErrorActionPreference = 'Stop'

# 拉取钉死的 llama.cpp b11211 运行时（CUDA 12.4 双 zip），解压 llama-server 及依赖 DLL 到 vendor/llama/。
# 两个资产必须同时到位：缺 cudart 时 CUDA 后端会静默失效并回退 CPU。

$projectRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $projectRoot 'vendor\llama'
$cacheDir = Join-Path $projectRoot 'vendor\llama-zips'

$assets = @(
    @{
        Name   = 'llama-b11211-bin-win-cuda-12.4-x64.zip'
        Url    = 'https://github.com/ggml-org/llama.cpp/releases/download/b11211/llama-b11211-bin-win-cuda-12.4-x64.zip'
        Sha256 = '33c8475c137bdaf7d0c108b0e77cb02eddc26f53d193c3acf69f1e4237668081'
    },
    @{
        Name   = 'cudart-llama-bin-win-cuda-12.4-x64.zip'
        Url    = 'https://github.com/ggml-org/llama.cpp/releases/download/b11211/cudart-llama-bin-win-cuda-12.4-x64.zip'
        Sha256 = '8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6'
    }
)

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
if ($present) {
    Write-Host "vendor/llama 已包含 llama-server 与 CUDA 运行时，跳过下载。"
    exit 0
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

Write-Host "llama.cpp b11211 运行时已就绪：$targetDir"
