param(
    [Parameter(Mandatory=$true)][string]$Archive,
    [Parameter(Mandatory=$true)][string]$Destination
)
$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 reads BOM-less scripts using the system code page.
# Keep this shipped script ASCII so parsing does not depend on the user's locale.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$runtimeTarget = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $runtimeTarget) { throw 'Extraction destination must be a new directory' }
$runtimePrefix = $runtimeTarget.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$zip = [IO.Compression.ZipFile]::OpenRead($Archive)
try {
    [long]$expandedBytes = 0
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName.Replace('/', '\')
        if ([IO.Path]::IsPathRooted($name) -or $name.Contains(':')) { throw 'Runtime archive contains an absolute path' }
        $resolvedEntry = [IO.Path]::GetFullPath([IO.Path]::Combine($runtimeTarget, $name))
        if (-not $resolvedEntry.StartsWith($runtimePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime archive entry escapes the destination directory' }
        if ((($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw 'Runtime archive must not contain symbolic links' }
        $expandedBytes += $entry.Length
        if ($expandedBytes -gt 25GB -or $zip.Entries.Count -gt 150000) { throw 'Runtime archive exceeds extraction limits' }
    }
} finally { $zip.Dispose() }
[IO.Compression.ZipFile]::ExtractToDirectory($Archive, $runtimeTarget)
