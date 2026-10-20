$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'sha256.ps1')
$projectRoot = Split-Path -Parent $PSScriptRoot
$vendorRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'vendor'))
$target = [IO.Path]::GetFullPath((Join-Path $vendorRoot 'llama-vulkan'))
$cacheRoot = Join-Path $vendorRoot 'llama-zips'
$catalog = Get-Content -LiteralPath (Join-Path $projectRoot 'build\runtime-catalog.json') -Raw | ConvertFrom-Json
$packages = @($catalog.packages | Where-Object {
    $_.kind -eq 'llama' -and $_.architecture -eq 'x64' -and $_.backend -eq 'vulkan'
})
if ($packages.Count -ne 1) { throw 'Runtime catalog must contain exactly one Windows x64 Vulkan llama package.' }
$package = $packages[0]
if (-not $package.url -or $package.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Vulkan llama runtime URL or SHA-256 is invalid.' }
$archiveName = [IO.Path]::GetFileName(([Uri]$package.url).AbsolutePath)
$archive = Join-Path $cacheRoot $archiveName
$expectedSource = $package.sha256.ToLowerInvariant()
$marker = Join-Path $target 'nola-runtime-source.txt'
# The server entry point and the libraries it loads. The list follows the imports of
# llama-server.exe and llama-server-impl.dll; the full dependency closure is verified
# against the extracted files, so a library this list does not name is still caught.
$requiredFiles = @('llama-server.exe', 'llama-server-impl.dll', 'llama-common.dll', 'llama.dll', 'mtmd.dll', 'ggml.dll', 'ggml-base.dll', 'ggml-vulkan.dll')
# The CPU backend is one library per microarchitecture and the loader picks the one the
# running CPU supports, so the archive has to carry the family rather than a fixed name.
$cpuBackendPattern = 'ggml-cpu*.dll'

$present = ($requiredFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $target $_)) }).Count -eq 0 `
    -and [bool](Get-ChildItem -LiteralPath $target -Filter $cpuBackendPattern -File -ErrorAction SilentlyContinue)
if ($present -and (Test-Path -LiteralPath $marker) -and (Get-Content -LiteralPath $marker -Raw).Trim() -eq $expectedSource) {
    Write-Host "vendor/llama-vulkan already contains the catalog Vulkan runtime; skipping download."
    exit 0
}
if (Test-Path -LiteralPath $target) {
    throw 'vendor/llama-vulkan exists but is incomplete or has a different source; inspect and move it before rebuilding.'
}

New-Item -ItemType Directory -Force -Path $vendorRoot, $cacheRoot | Out-Null
if ((Test-Path -LiteralPath $archive) -and (Get-Sha256Hex $archive) -ne $expectedSource) {
    Remove-Item -LiteralPath $archive -Force
}
if (-not (Test-Path -LiteralPath $archive)) {
    $part = "$archive.part"
    Write-Host "Downloading $archiveName ..."
    Invoke-WebRequest -Uri $package.url -OutFile $part
    if ((Get-Sha256Hex $part) -ne $expectedSource) {
        Remove-Item -LiteralPath $part -Force
        throw 'Vulkan llama runtime SHA-256 verification failed.'
    }
    Move-Item -LiteralPath $part -Destination $archive
}

$staging = Join-Path $vendorRoot "llama-vulkan.staging-$([Guid]::NewGuid().ToString('N'))"
$vendorPrefix = $vendorRoot.TrimEnd('\') + '\'
if (-not [IO.Path]::GetFullPath($staging).StartsWith($vendorPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Vulkan llama staging path escapes vendor.'
}
try {
    & (Join-Path $PSScriptRoot 'extract-runtime.ps1') -Archive $archive -Destination $staging
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $staging $file))) { throw "Vulkan runtime archive is missing $file." }
    }
    if (-not (Get-ChildItem -LiteralPath $staging -Filter $cpuBackendPattern -File)) { throw 'Vulkan runtime archive has no CPU backend library.' }
    & node (Join-Path $PSScriptRoot 'verify-llama-runtime.mjs') $staging
    if ($LASTEXITCODE -ne 0) { throw 'Vulkan llama runtime does not resolve its dependencies.' }
    Set-Content -LiteralPath (Join-Path $staging 'nola-runtime-source.txt') -Value $expectedSource -Encoding ASCII
    Move-Item -LiteralPath $staging -Destination $target
} finally {
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
}
Write-Host "llama.cpp $($package.version) Vulkan runtime is ready: $target"
