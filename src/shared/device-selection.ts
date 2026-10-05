import type { ComputeDevice, HardwareInventory, RuntimeSnapshot } from './compute'

export type DeviceIntent = { backend: 'cuda' | 'vulkan' | 'xpu' | 'directml'; hardwareId: string }
// Vulkan may report "UHD Graphics" where the OS reports "UHD Graphics 770".
function sameAdapterName(left: string, right: string): boolean {
  const a = left.trim().toLowerCase()
  const b = right.trim().toLowerCase()
  return a === b || (a.endsWith('uhd graphics') && b.startsWith(`${a} `)) ||
    (b.endsWith('uhd graphics') && a.startsWith(`${b} `))
}
export function encodeDeviceIntent(intent: DeviceIntent): string {
  return `hardware:${intent.backend}:${encodeURIComponent(intent.hardwareId)}`
}
export function decodeDeviceIntent(value: string): DeviceIntent | null {
  const match = /^hardware:(cuda|vulkan|xpu|directml):(.+)$/.exec(value)
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
      ? adapter.vendor === 'nvidia' ? ['cuda', 'vulkan'] : ['vulkan']
      : adapter.vendor === 'nvidia' ? ['cuda', 'directml'] : adapter.vendor === 'intel' ? ['xpu', 'directml'] : ['directml']
    return backends.map(backend => {
      const supported = task === 'llama' || backend === 'cuda'
      const local = task === 'torch' ? runtimes.local.engine : runtimes.local.llama
      const reusable = local.status === 'ready' && local.gpuAvailable && local.backend === backend
      const packageReady = task === 'torch'
        ? runtimes.recipes.some(p => p.backend === backend && p.installed)
        : runtimes.packages.some(p => p.kind === 'llama' && p.backend === backend && p.installed)
      const reason = supported ? reusable || packageReady ? '待后端确认' : '需准备环境'
        : backend === 'xpu' ? '当前识别模型尚未支持 XPU 环境' : '当前识别模型尚未支持 DirectML 环境'
      return { value: encodeDeviceIntent({ backend, hardwareId: adapter.hardwareId }), name: adapter.name, backend, supported, reason }
    })
  })
}

/** Native indices belong to the selected runtime, never to the persisted hardware intent. */
export function resolveDeviceIntent(value: string, hardware: HardwareInventory, devices: ComputeDevice[], task: 'torch' | 'llama'): string {
  const intent = decodeDeviceIntent(value)
  if (!intent) {
    if (value.startsWith('hardware:')) throw new Error('计算设备选择格式无效，请重新选择')
    return value
  }
  const adapter = hardware.adapters.find(a => a.hardwareId === intent.hardwareId)
  if (!adapter) throw new Error('指定显卡已断开，请重新选择计算设备')
  // Names alone cannot distinguish two identical physical adapters.
  if (hardware.adapters.filter(a => sameAdapterName(a.name, adapter.name)).length !== 1) throw new Error('存在同名显卡，无法可靠匹配指定设备，请使用后端枚举的设备选项')
  const matches = devices.filter(d => sameAdapterName(d.name, adapter.name) &&
    (task === 'torch' ? !!d.torchDevice && d.backend === intent.backend && d.recognition
      : !!d.llamaDevice && d.translation && d.llamaDevice.toLowerCase().startsWith(intent.backend)))
  if (matches.length !== 1) throw new Error(`${adapter.name} 未被 ${intent.backend.toUpperCase()} 后端唯一识别；请检查驱动或重新选择设备`)
  return matches[0].id
}
