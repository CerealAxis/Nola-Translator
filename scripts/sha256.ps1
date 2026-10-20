# SHA-256 for build scripts.
#
# `Get-FileHash` is not used on purpose. It lives in the `Microsoft.PowerShell.Utility`
# module, and a Windows PowerShell 5.1 process that inherits a PSModulePath written by
# PowerShell 7 resolves that module to the PowerShell 7 directory first, fails to load it
# and never falls back to its own copy. The cmdlet then simply does not exist, which is how
# a CI job that runs `powershell` under a `pwsh` shell fails on a hash it never computed.
# The cryptography API is part of the runtime, so it is available whatever the module
# search path happens to be.
function Get-Sha256Hex([string]$Path) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $bytes = $sha.ComputeHash($stream)
    } finally {
        $stream.Dispose()
        $sha.Dispose()
    }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}
