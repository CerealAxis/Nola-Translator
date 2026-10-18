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
    expect(resolveDeviceIntent(encodeDeviceIntent({ backend: 'cuda', hardwareId: hardware.adapters[0].hardwareId }), hardware, devices, 'llama')).toBe('llama-gpu')
  })

  it('returns automatic placement when the preferred GPU is unavailable', () => {
    expect(resolveDeviceIntent(encodeHardwarePreference('missing'), hardware, [cpu], 'torch')).toBe('auto')
    expect(resolveDeviceIntent(encodeHardwarePreference(hardware.adapters[0].hardwareId), hardware, [cpu], 'torch')).toBe('auto')
  })

  it('matches the selected device on the model loader even if its saved backend differs', () => {
    const nvidiaHardware: HardwareInventory = {
      ...hardware,
      adapters: [{ ...hardware.adapters[0], name: 'NVIDIA GeForce RTX 4060 Laptop GPU' }],
    }
    const vulkanOnly: ComputeDevice[] = [cpu,
      { ...cpu, id: 'llama-vulkan', name: 'NVIDIA GeForce RTX 4060 Laptop GPU', backend: 'vulkan', torchDevice: null, llamaDevice: 'Vulkan0' },
    ]
    const selectedCuda = encodeDeviceIntent({ backend: 'cuda', hardwareId: nvidiaHardware.adapters[0].hardwareId })
    expect(resolveDeviceIntent(selectedCuda, nvidiaHardware, vulkanOnly, 'llama')).toBe('llama-vulkan')
  })

  it('falls back to automatic placement when no loader-supported device matches', () => {
    const nvidiaHardware: HardwareInventory = {
      ...hardware,
      adapters: [{ ...hardware.adapters[0], name: 'NVIDIA GeForce RTX 4060 Laptop GPU' }],
    }
    const selectedCuda = encodeDeviceIntent({ backend: 'cuda', hardwareId: nvidiaHardware.adapters[0].hardwareId })
    expect(resolveDeviceIntent(selectedCuda, nvidiaHardware, [cpu], 'llama')).toBe('auto')
  })

  it('picks the loader-supported device with the most matching name characters', () => {
    const similarHardware: HardwareInventory = {
      ...hardware,
      adapters: [{ ...hardware.adapters[0], name: 'NVIDIA GeForce RTX 4060 Laptop GPU' }],
    }
    const devices: ComputeDevice[] = [cpu,
      { ...cpu, id: 'close', name: 'NVIDIA GeForce RTX 4060', backend: 'cuda', torchDevice: 'cuda:0' },
      { ...cpu, id: 'best', name: 'NVIDIA GeForce RTX 4060 Laptop', backend: 'cuda', torchDevice: 'cuda:1' },
      { ...cpu, id: 'other-model', name: 'NVIDIA GeForce RTX 4090 Laptop GPU', backend: 'cuda', torchDevice: 'cuda:2' },
    ]
    const selectedCuda = encodeDeviceIntent({ backend: 'cuda', hardwareId: similarHardware.adapters[0].hardwareId })
    expect(resolveDeviceIntent(selectedCuda, similarHardware, devices, 'torch')).toBe('best')
  })

  it('uses the first device when the common-character count is tied', () => {
    const similarHardware: HardwareInventory = {
      ...hardware,
      adapters: [{ ...hardware.adapters[0], name: 'NVIDIA GeForce RTX 4060 Laptop GPU' }],
    }
    const devices: ComputeDevice[] = [cpu,
      { ...cpu, id: 'first', name: 'NVIDIA GeForce RTX 4060 Laptop', backend: 'cuda', torchDevice: 'cuda:0' },
      { ...cpu, id: 'second', name: 'NVIDIA GeForce RTX 4060 Laptop', backend: 'cuda', torchDevice: 'cuda:1' },
    ]
    const selectedCuda = encodeDeviceIntent({ backend: 'cuda', hardwareId: similarHardware.adapters[0].hardwareId })
    expect(resolveDeviceIntent(selectedCuda, similarHardware, devices, 'torch')).toBe('first')
  })
})
