param(
    [Parameter(Mandatory=$true)][string]$Archive,
    [Parameter(Mandatory=$true)][string]$Destination
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$runtimeTarget = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $runtimeTarget) { throw '解压目标必须是新的目录' }
$runtimePrefix = $runtimeTarget.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$zip = [IO.Compression.ZipFile]::OpenRead($Archive)
try {
    [long]$expandedBytes = 0
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName.Replace('/', '\')
        if ([IO.Path]::IsPathRooted($name) -or $name.Contains(':')) { throw '运行包含绝对路径' }
        $resolvedEntry = [IO.Path]::GetFullPath([IO.Path]::Combine($runtimeTarget, $name))
        if (-not $resolvedEntry.StartsWith($runtimePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw '运行包路径越界' }
        if ((($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw '运行包不允许符号链接' }
        $expandedBytes += $entry.Length
        if ($expandedBytes -gt 25GB -or $zip.Entries.Count -gt 150000) { throw '运行包解压体积超限' }
    }
} finally { $zip.Dispose() }
[IO.Compression.ZipFile]::ExtractToDirectory($Archive, $runtimeTarget)
