param(
    [Parameter(Mandatory=$true)][string]$SourceDirectory,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9][a-z0-9-]{0,79}$')][string]$Id,
    [Parameter(Mandatory=$true)][ValidateSet('engine', 'llama')][string]$Kind,
    [Parameter(Mandatory=$true)][ValidateSet('cpu', 'cuda', 'xpu', 'rocm', 'vulkan')][string]$Backend,
    [Parameter(Mandatory=$true)][string]$Version,
    [Parameter(Mandatory=$true)][string]$Name,
    [Parameter(Mandatory=$true)][ValidatePattern('^https://')][string]$DownloadUrl,
    [string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot 'artifacts\runtimes' }
$sourceRoot = (Resolve-Path -LiteralPath $SourceDirectory).Path
$executableName = if ($Kind -eq 'engine') { 'NolaTranslatorEngine.exe' } else { 'llama-server.exe' }
if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $executableName))) { throw '源目录不是完整的运行环境' }
$catalogPath = Join-Path $projectRoot 'build\runtime-catalog.json'
$catalog = Get-Content -LiteralPath $catalogPath -Raw | ConvertFrom-Json
if (@($catalog.packages | Where-Object { $_.id -eq $Id }).Count -gt 0) { throw '发布目录已有此 ID，不能覆盖已有版本' }
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
$sourcePrefix = $sourceRoot.TrimEnd('\') + '\'
if ($outputRoot -eq $sourceRoot -or $outputRoot.StartsWith($sourcePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw '输出目录必须位于运行环境外' }
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$archive = Join-Path $outputRoot "$Id.zip"
if (Test-Path -LiteralPath $archive) { throw '运行包已存在；请使用新的版本 ID 或输出目录' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($sourceRoot, $archive, [IO.Compression.CompressionLevel]::Optimal, $false)
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$entry = [ordered]@{ id=$Id; name=$Name; kind=$Kind; backend=$Backend; version=$Version; url=$DownloadUrl; sha256=$hash; bytes=(Get-Item -LiteralPath $archive).Length }
$catalog.packages = @($catalog.packages) + @($entry)
$catalog | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $catalogPath -Encoding UTF8
Write-Output "运行包：$archive"
Write-Output '请将运行包发布到指定 DownloadUrl 后，再分发包含此发布目录的应用。'
