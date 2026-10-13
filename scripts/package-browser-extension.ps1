$ErrorActionPreference = 'Stop'
$Workspace = Split-Path -Parent $PSScriptRoot
$ExtensionDirectory = Join-Path $Workspace 'browser\extension\dist'
$ReleaseDirectory = Join-Path $Workspace 'release'
$Destination = Join-Path $ReleaseDirectory 'Nola-Browser-Extension.zip'
$BrowserVersion = (Get-Content -LiteralPath (Join-Path $Workspace 'browser\version.json') -Raw | ConvertFrom-Json).version
if ($BrowserVersion -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') { throw "Invalid browser extension version: $BrowserVersion" }
if (-not (Test-Path -LiteralPath (Join-Path $ExtensionDirectory 'manifest.json'))) { throw 'Build the browser extension first' }
New-Item -ItemType Directory -Path $ReleaseDirectory -Force | Out-Null

# Compress-Archive records Windows separators in the entry names, so extracting the archive yields
# files literally called `icons\icon-16.png` instead of files inside an `icons` directory. Manifest
# icon paths are resolved strictly and the extension refuses to load, so entries are written by hand
# with the forward slashes the ZIP format requires.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Force }
$root = (Resolve-Path -LiteralPath $ExtensionDirectory).Path.TrimEnd('\')
$archive = [System.IO.Compression.ZipFile]::Open($Destination, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -LiteralPath $root -Recurse -File | ForEach-Object {
    $entryName = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive, $_.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $archive.Dispose()
}

# Chrome and Edge use the same unpacked MV3 payload; keep browser-specific names
# on release assets while preserving the generic archive embedded by the desktop app.
Copy-Item -LiteralPath $Destination -Destination (Join-Path $ReleaseDirectory "Nola-Chrome-Extension-v$BrowserVersion.zip") -Force
Copy-Item -LiteralPath $Destination -Destination (Join-Path $ReleaseDirectory "Nola-Edge-Extension-v$BrowserVersion.zip") -Force
