import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const run = promisify(execFile)
const versionScript = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$device = Get-PnpDevice -Class MEDIA | Where-Object { $_.FriendlyName -eq 'VB-Audio Virtual Cable' -and $_.Status -eq 'OK' } | Select-Object -First 1
if ($device) { (Get-PnpDeviceProperty -InstanceId $device.InstanceId -KeyName 'DEVPKEY_Device_DriverVersion').Data }
`
const script = String.raw`
$ErrorActionPreference = 'Stop'
$zip = Join-Path $env:NOLA_CABLE_SETUP_DIR 'VBCABLE.zip'
$files = Join-Path $env:NOLA_CABLE_SETUP_DIR 'files'
Invoke-WebRequest -UseBasicParsing -TimeoutSec 90 -Uri 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip' -OutFile $zip
if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne 'B950E39F01AF1D04EA623C8F6D8EB9B6EA5C477C637295FABF20631C85116BFB') {
  throw 'The VB-CABLE package checksum changed.'
}
Expand-Archive -LiteralPath $zip -DestinationPath $files
$setup = Join-Path $files 'VBCABLE_Setup_x64.exe'
$signature = Get-AuthenticodeSignature -LiteralPath $setup
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '^CN=BUREL VINCENT Entrepreneur individuel,') {
  throw 'The VB-CABLE installer signature is invalid.'
}
$process = Start-Process -FilePath $setup -WorkingDirectory $files -Verb RunAs -PassThru -Wait
exit $process.ExitCode
`

let pending: Promise<void> | undefined

export async function readVirtualCableDriverVersion(): Promise<string | null> {
  if (process.platform !== 'win32') return null
  try {
    const { stdout } = await run(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', versionScript], { windowsHide: true, timeout: 15_000 })
    const version = stdout.trim().split(/\r?\n/)[0]
    return /^\d+(?:\.\d+){1,3}$/.test(version) ? version : null
  } catch {
    return null
  }
}

export function installVirtualCable(): Promise<void> {
  if (process.platform !== 'win32' || process.arch !== 'x64') return Promise.reject(new Error('VB-CABLE setup requires Windows x64'))
  return pending ??= (async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-vbcable-'))
    try {
      await run(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        ['-NoProfile', '-NonInteractive', '-Command', script], {
          env: { ...process.env, NOLA_CABLE_SETUP_DIR: directory }, windowsHide: true,
        })
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
  })().finally(() => { pending = undefined })
}
