import { describe, expect, it } from 'vitest'
import { encodeDeviceIntent, encodeHardwarePreference, resolveDeviceIntent } from './device-selection'
import type { ComputeDevice, HardwareInventory } from './compute'

const hardware: HardwareInventory = {
  adapters: [{ hardwareId: 'PCI\\VEN_10DE&DEV_1234', name: 'Example GPU', vendor: 'nvidia', driver: '1.0' }],
  nvidiaDriver: '1.0', notes: [],
}
const cpu: ComputeDevice = {
  id: 'cpu', name: 'CPU', backend: 'cpu', torchDevice: 'cpu', llamaDevice: 'cpu',
  totalMemoryMb: 0, freeMemoryMb: 0, integrated: false, stableId: true,
  recognition: true, translation: true, reason: '', score: 0,
}

describe('physical GPU preference', () => {
  it('maps the same GPU to the active model loader', () => {
    const devices: ComputeDevice[] = [cpu,
      { ...cpu, id: 'torch-gpu', name: 'Example GPU', backend: 'cuda', torchDevice: 'cuda:0', llamaDevice: null },
      { ...cpu, id: 'llama-gpu', name: 'Example GPU', backend: 'vulkan', torchDevice: null, llamaDevice: 'Vulkan0' },
    ]
    const preferred = encodeHardwarePreference(hardware.adapters[0].hardwareId)
    expect(resolveDeviceIntent(preferred, hardware, devices, 'torch')).toBe('torch-gpu')
    expect(resolveDeviceIntent(preferred, hardware, devices, 'llama')).toBe('llama-gpu')
    expect(() => resolveDeviceIntent(encodeDeviceIntent({ backend: 'cuda', hardwareId: hardware.adapters[0].hardwareId }), hardware, devices, 'llama')).toThrow()
  })

  it('returns automatic placement when the preferred GPU is unavailable', () => {
    expect(resolveDeviceIntent(encodeHardwarePreference('missing'), hardware, [cpu], 'torch')).toBe('auto')
    expect(resolveDeviceIntent(encodeHardwarePreference(hardware.adapters[0].hardwareId), hardware, [cpu], 'torch')).toBe('auto')
  })
})
