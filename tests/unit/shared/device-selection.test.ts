import { describe, expect, it } from 'vitest'
import { deviceCandidates, encodeDeviceIntent, resolveDeviceIntent, selectedLlamaBackend } from '../../../src/shared/device-selection'
import type { ComputeDevice, RuntimeSnapshot } from '../../../src/shared/compute'

const intel = { name: 'Intel(R) UHD Graphics', vendor: 'intel' as const, driver: '1', hardwareId: 'PCI\\VEN_8086&DEV_4688' }
const hardware = { adapters: [intel], nvidiaDriver: null, notes: [] }
const value = encodeDeviceIntent({ backend: 'vulkan', hardwareId: intel.hardwareId })
const runtime = { hardware, local: { engine: { status: 'ready', backend: 'cuda', gpuAvailable: true }, llama: { status: 'ready', backend: 'cuda', gpuAvailable: true } }, recipes: [], packages: [] } as unknown as RuntimeSnapshot
const device: ComputeDevice = { id: 'llama:Vulkan1:Intel(R) UHD Graphics', name: intel.name, backend: 'vulkan', torchDevice: null, llamaDevice: 'Vulkan1', totalMemoryMb: 2048, freeMemoryMb: 2048, integrated: true, stableId: false, recognition: false, translation: true, reason: '', score: 100 }

describe('hardware device intent', () => {
  it('offers Intel Vulkan before its environment is installed, independent of local CUDA', () => {
    expect(deviceCandidates(hardware, 'llama', runtime)).toEqual([expect.objectContaining({ value, supported: true, reason: '需准备环境' })])
    expect(deviceCandidates(hardware, 'torch', runtime).every(c => !c.supported)).toBe(true)
  })
  it('resolves to the index from the newly selected backend, without modifying persisted intent', () => {
    expect(resolveDeviceIntent(value, hardware, [device], 'llama')).toBe(device.id)
    expect(resolveDeviceIntent(value, hardware, [{ ...device, id: 'new-index', llamaDevice: 'Vulkan0' }], 'llama')).toBe('new-index')
  })
  it('rejects absent devices, wrong backends and ambiguous physical identities', () => {
    expect(() => resolveDeviceIntent(value, hardware, [], 'llama')).toThrow()
    expect(() => resolveDeviceIntent(value, hardware, [{ ...device, llamaDevice: 'CUDA0' }], 'llama')).toThrow()
    expect(() => resolveDeviceIntent(value, { ...hardware, adapters: [intel, { ...intel, hardwareId: 'second' }] }, [device], 'llama')).toThrow('同名')
    expect(() => resolveDeviceIntent(value, { ...hardware, adapters: [] }, [device], 'llama')).toThrow('断开')
  })
  it('retains CPU, auto and legacy engine device selections', () => {
    for (const choice of ['cpu', 'auto', 'cuda:uuid']) expect(resolveDeviceIntent(choice, hardware, [], 'torch')).toBe(choice)
  })
  it('matches the requested runtime backend independently of the current CUDA environment', () => {
    expect(selectedLlamaBackend(value)).toBe('vulkan')
    expect(selectedLlamaBackend('cuda:uuid')).toBe('cuda')
    expect(selectedLlamaBackend('llama:Vulkan0:GPU')).toBe('vulkan')
    expect(selectedLlamaBackend('auto')).toBeNull()
  })
})
