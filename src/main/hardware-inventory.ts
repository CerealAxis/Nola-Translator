import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { HardwareInventory } from '../shared/compute'

const run = promisify(execFile)
export function compareDriverVersions(a: string, b: string): number {
  const left = a.split('.').map(Number), right = b.split('.').map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0)
    if (difference) return difference
  }
  return 0
}

/** Detect installation prerequisites without importing torch or starting the engine. */
export async function probeHardware(): Promise<HardwareInventory> {
  const result: HardwareInventory = { adapters: [], nvidiaDriver: null, notes: [] }
  const reads = await Promise.allSettled([
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; @(Get-CimInstance Win32_VideoController | Select-Object Name,PNPDeviceID,DriverVersion) | ConvertTo-Json -Compress'],
    { windowsHide: true, timeout: 10_000, maxBuffer: 128 * 1024 }),
    run('nvidia-smi.exe', ['--query-gpu=driver_version', '--format=csv,noheader'],
      { windowsHide: true, timeout: 5000, maxBuffer: 64 * 1024 }),
  ])
  if (reads[0].status === 'fulfilled') {
    try {
      const parsed = JSON.parse(reads[0].value.stdout.replace(/^\uFEFF/, '').trim()) as unknown
      for (const raw of Array.isArray(parsed) ? parsed : [parsed]) {
        if (!raw || typeof raw !== 'object') continue
        const d = raw as Record<string, unknown>
        const hardwareId = String(d.PNPDeviceID ?? '').slice(0, 512)
        if (!/^PCI\\/i.test(hardwareId)) continue
        const vendor = /VEN_10DE/i.test(hardwareId) ? 'nvidia' : /VEN_1002/i.test(hardwareId) ? 'amd' : /VEN_8086/i.test(hardwareId) ? 'intel' : 'other'
        result.adapters.push({ name: String(d.Name ?? '').slice(0, 256), vendor,
          driver: String(d.DriverVersion ?? '').slice(0, 64), hardwareId })
      }
    } catch { result.notes.push('系统显卡信息无法解析') }
  } else result.notes.push('系统显卡信息暂时不可用；CPU 环境仍可使用')
  if (reads[1].status === 'fulfilled') {
    const versions = reads[1].value.stdout.trim().split(/\r?\n/).filter(v => /^\d+\.\d+$/.test(v))
    result.nvidiaDriver = versions.sort(compareDriverVersions)[0] ?? null
  }
  return result
}
