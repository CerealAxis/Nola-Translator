param([string]$SourceDirectory = '', [string]$CMake = '')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$buildRoot = Join-Path $repoRoot 'build/game-hook-build'
$outputRoot = Join-Path $repoRoot 'build/game-hook'
$revision = '31b502ebf34c35d27276a3d5aaf58ca7b45f0f3b'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$visualStudio = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -format json | ConvertFrom-Json)[0]
if (-not $visualStudio) { throw 'Visual Studio C++ build tools are required' }
$major = ([version]$visualStudio.installationVersion).Major
$generator = switch ($major) { 17 { 'Visual Studio 17 2022' } 18 { 'Visual Studio 18 2026' } default { throw "Unsupported Visual Studio generator version $major" } }
if (-not $CMake) {
  $command = Get-Command cmake -ErrorAction SilentlyContinue
  if ($command) { $CMake = $command.Source }
  else {
    $CMake = Join-Path $visualStudio.installationPath 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
  }
}
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}
if (-not $SourceDirectory) {
  $SourceDirectory = Join-Path $buildRoot 'LunaTranslator'
  if (-not (Test-Path -LiteralPath (Join-Path $SourceDirectory '.git'))) {
    Invoke-Checked 'git' @('clone', '--filter=blob:none', '--no-checkout', 'https://github.com/HIllya51/LunaTranslator.git', $SourceDirectory)
    Invoke-Checked 'git' @('-C', $SourceDirectory, 'checkout', '--detach', $revision)
  }
}
$actualRevision = & git -C $SourceDirectory rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $actualRevision -ne $revision) { throw 'Unexpected LunaTranslator source revision' }
$hookSource = Join-Path $SourceDirectory 'src/NativeImpl/LunaHook'
$minhook = Join-Path $buildRoot 'minhook'
if (-not (Test-Path -LiteralPath (Join-Path $minhook '.git'))) {
  Invoke-Checked 'git' @('clone', '--no-checkout', 'https://github.com/TsudaKageyu/minhook.git', $minhook)
}
Invoke-Checked 'git' @('-C', $minhook, 'checkout', '--detach', '8af6b4acae5a9388fd742b56fa79ece89d96f823')
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
foreach ($arch in @('x64', 'Win32')) {
  $bits = if ($arch -eq 'x64') { '64' } else { '32' }
  $lunaBuild = Join-Path $buildRoot "luna-$bits"
  Invoke-Checked $CMake @('-S', $hookSource, '-B', $lunaBuild, '-G', $generator, '-A', $arch, '-DBUILD_GUI=OFF', '-DWIN10ABOVE=ON', '-DCMAKE_POLICY_VERSION_MINIMUM=3.16', "-DFETCHCONTENT_SOURCE_DIR_MINHOOK=$minhook")
  Invoke-Checked $CMake @('--build', $lunaBuild, '--config', 'Release', '--target', 'LunaHostDll', 'LunaHook', '-j', '4')
  $helperBuild = Join-Path $buildRoot "helper-$bits"
  Invoke-Checked $CMake @('-S', (Join-Path $repoRoot 'native/game-hook'), '-B', $helperBuild, '-G', $generator, '-A', $arch)
  Invoke-Checked $CMake @('--build', $helperBuild, '--config', 'Release', '-j', '4')
  Copy-Item -LiteralPath (Join-Path $helperBuild 'Release/nola-game-hook.exe') -Destination (Join-Path $outputRoot "nola-game-hook$bits.exe")
  foreach ($library in @("LunaHost$bits.dll", "LunaHook$bits.dll")) {
    Copy-Item -LiteralPath (Join-Path $hookSource "builds/Release_win10/$library") -Destination $outputRoot
  }
  Invoke-Checked (Join-Path $outputRoot "nola-game-hook$bits.exe") @('--self-test')
}
$licenses = Join-Path $outputRoot 'licenses'
New-Item -ItemType Directory -Path $licenses -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $SourceDirectory 'LICENSE') -Destination (Join-Path $licenses 'LunaTranslator-GPL-3.0.txt')
Copy-Item -LiteralPath (Join-Path $buildRoot 'luna-64/_deps/uchardet-src/COPYING') -Destination (Join-Path $licenses 'uchardet-MPL-1.1.txt')
Copy-Item -LiteralPath (Join-Path $minhook 'LICENSE.txt') -Destination (Join-Path $licenses 'MinHook-BSD.txt')
$sources = Join-Path $outputRoot 'sources'
New-Item -ItemType Directory -Path $sources -Force | Out-Null
Invoke-Checked 'git' @('-C', $SourceDirectory, 'archive', '--format=zip', "--output=$(Join-Path $sources 'LunaTranslator-native-source.zip')", $revision, 'LICENSE', 'src/NativeImpl', 'src/version.txt')
Invoke-Checked 'git' @('-C', $minhook, 'archive', '--format=zip', "--output=$(Join-Path $sources 'MinHook-source.zip')", '8af6b4acae5a9388fd742b56fa79ece89d96f823')
$uchardetSource = Join-Path $buildRoot 'luna-64/_deps/uchardet-src'
$uchardetFiles = @(Get-ChildItem -LiteralPath $uchardetSource | Where-Object Name -NE '.git' | Select-Object -ExpandProperty FullName)
Compress-Archive -Path $uchardetFiles -DestinationPath (Join-Path $sources 'uchardet-patched-source.zip') -Force
$helperSources = Join-Path $sources 'nola-game-hook'
New-Item -ItemType Directory -Path $helperSources -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $repoRoot 'native/game-hook') | Copy-Item -Destination $helperSources -Recurse -Force
Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $sources 'build-game-hook.ps1')
@"
LunaTranslator/LunaHook: GPL-3.0, revision $revision
https://github.com/HIllya51/LunaTranslator/tree/$revision
MinHook: BSD-2-Clause, revision 8af6b4acae5a9388fd742b56fa79ece89d96f823
uchardet: source retains MPL-1.1/GPL-2.0-or-later/LGPL-2.1-or-later notices.
The included uchardet source contains LunaHook's libuchardet.cmake build-time patches.
The Nola helper source and its build recipe are included in sources/.
Build LunaHook with CMake, BUILD_GUI=OFF, WIN10ABOVE=ON, and architectures x64/Win32.
To build offline, extract the archives and pass FETCHCONTENT_SOURCE_DIR_MINHOOK and
FETCHCONTENT_SOURCE_DIR_UCHARDET to those extracted dependency directories.
Build the helper with CMake from sources/nola-game-hook for each matching architecture.
No model weights or fonts are distributed by this Hook package.
"@ | Set-Content -LiteralPath (Join-Path $outputRoot 'SOURCE.txt') -Encoding utf8
$manifest = @{
  protocolVersion = 3
  source = 'https://github.com/HIllya51/LunaTranslator'; revision = $revision
  uchardetRevision = '06029ec3340cdf6bf9a6a537dafb3f39eda0560e'
  minhookRevision = '8af6b4acae5a9388fd742b56fa79ece89d96f823'
  files = @(Get-ChildItem -LiteralPath $outputRoot -File | Where-Object Extension -In '.exe', '.dll' | ForEach-Object { @{ name = $_.Name; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } })
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $outputRoot 'manifest.json') -Encoding utf8
