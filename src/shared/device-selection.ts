import type { ComputeDevice, HardwareInventory, RuntimeSnapshot } from './compute'

export type DeviceIntent = { backend: 'cuda' | 'vulkan' | 'xpu' | 'directml' | 'sycl' | 'openvino' | 'rocm'; hardwareId: string }
export function encodeHardwarePreference(hardwareId: string): string {
  return `hardware:${encodeURIComponent(hardwareId)}`
}
export function preferredHardwareId(value: string): string | null {
  if (!value.startsWith('hardware:')) return null
  const legacy = decodeDeviceIntent(value)
  if (legacy) return legacy.hardwareId
  try { return decodeURIComponent(value.slice('hardware:'.length)) } catch { return null }
}
// Vulkan may report "UHD Graphics" where the OS reports "UHD Graphics 770".
export function sameAdapterName(left: string, right: string): boolean {
  const a = left.trim().toLowerCase()
  const b = right.trim().toLowerCase()
  return a === b || (a.endsWith('uhd graphics') && b.startsWith(`${a} `)) ||
    (b.endsWith('uhd graphics') && a.startsWith(`${b} `))
}

function commonAdapterCharacters(left: string, right: string): number {
  const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const normalizedLeft = normalize(left)
  const normalizedRight = normalize(right)
  const leftNumbers: string[] = normalizedLeft.match(/\d{3,}/g) ?? []
  const rightNumbers: string[] = normalizedRight.match(/\d{3,}/g) ?? []
  if (leftNumbers.length && rightNumbers.length && !leftNumbers.every(number => rightNumbers.includes(number))) return 0

  const counts = new Map<string, number>()
  for (const character of normalizedLeft) {
    counts.set(character, (counts.get(character) ?? 0) + 1)
  }
  let shared = 0
  for (const character of normalizedRight) {
    const remaining = counts.get(character) ?? 0
    if (remaining > 0) {
      shared++
      counts.set(character, remaining - 1)
    }
  }
  return shared
}

function bestDeviceMatch(
  name: string,
  devices: ComputeDevice[],
  supports: (device: ComputeDevice) => boolean,
): ComputeDevice | undefined {
  let best: ComputeDevice | undefined
  let bestScore = 4
  for (const device of devices) {
    if (!supports(device)) continue
    const score = commonAdapterCharacters(name, device.name)
    // Keep the first result when common-character counts tie; enumeration order is backend order.
    if (score > bestScore) {
      best = device
      bestScore = score
    }
  }
  return best
}
export function encodeDeviceIntent(intent: DeviceIntent): string {
  return `hardware:${intent.backend}:${encodeURIComponent(intent.hardwareId)}`
}
export function decodeDeviceIntent(value: string): DeviceIntent | null {
  const match = /^hardware:(cuda|vulkan|xpu|directml|sycl|openvino|rocm):(.+)$/.exec(value)
  if (!match) return null
  try { return { backend: match[1] as DeviceIntent['backend'], hardwareId: decodeURIComponent(match[2]) } } catch { return null }
}

export function selectedLlamaBackend(value: string): string | null {
  const intent = decodeDeviceIntent(value)
  if (intent) return intent.backend
  if (value.startsWith('llama:Vulkan')) return 'vulkan'
  if (value.startsWith('llama:CUDA') || value.startsWith('cuda:')) return 'cuda'
  return null
}

export function deviceCandidates(hardware: HardwareInventory, task: 'torch' | 'llama', runtimes: RuntimeSnapshot) {
  return hardware.adapters.flatMap(adapter => {
    const backends: DeviceIntent['backend'][] = task === 'llama'
      ? adapter.vendor === 'nvidia' ? ['cuda', 'vulkan'] : adapter.vendor === 'intel' ? ['vulkan', 'openvino', 'sycl'] : adapter.vendor === 'amd' ? ['vulkan', 'rocm'] : ['vulkan']
      : adapter.vendor === 'nvidia' ? ['cuda', 'directml'] : adapter.vendor === 'intel' ? ['xpu', 'directml'] : ['directml']
    return backends.map(backend => {
      const supported = true
      const local = task === 'torch' ? runtimes.local.engine : runtimes.local.llama
      const reusable = local.status === 'ready' && local.gpuAvailable && local.backend === backend
      const packageReady = task === 'torch'
        ? runtimes.recipes.some(p => p.backend === backend && p.installed)
        : runtimes.packages.some(p => p.kind === 'llama' && p.backend === backend && p.installed)
      const reason = reusable || packageReady ? '开始同传时校验设备与模型' : '需安装对应组件'
      return { value: encodeDeviceIntent({ backend, hardwareId: adapter.hardwareId }), name: adapter.name, backend, supported, reason }
    })
  })
}

/** Native indices belong to the selected runtime, never to the persisted hardware intent. */
export function resolveDeviceIntent(value: string, hardware: HardwareInventory, devices: ComputeDevice[], task: 'torch' | 'llama'): string {
  if (value === 'auto' || value === 'cpu') return value
  const intent = decodeDeviceIntent(value)
  if (!intent) {
    const preferredId = preferredHardwareId(value)
    if (preferredId !== null) {
      const adapter = hardware.adapters.find(a => a.hardwareId === preferredId)
      if (!adapter) return 'auto'
      return bestDeviceMatch(adapter.name, devices, d => task === 'torch' ? !!d.torchDevice : !!d.llamaDevice)?.id ?? 'auto'
    }
    if (value.startsWith('hardware:')) return 'auto'
    return value
  }
  const adapter = hardware.adapters.find(a => a.hardwareId === intent.hardwareId)
  if (!adapter) return 'auto'
  const match = bestDeviceMatch(adapter.name, devices, d => task === 'torch'
    ? !!d.torchDevice
    : !!d.llamaDevice)
  return match?.id ?? 'auto'
}
