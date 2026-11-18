import { afterEach, expect, it, vi } from 'vitest'
import { loadInterfaceFont } from './interface-font'

afterEach(() => vi.unstubAllGlobals())

it('does not need font loading support for the system default', async () => {
  await expect(loadInterfaceFont('system')).resolves.toBeUndefined()
})

it('rejects an unregistered family even when browser fallback would pass check', async () => {
  const load = vi.fn().mockResolvedValue([])
  vi.stubGlobal('document', { fonts: { load, check: () => true } })
  await expect(loadInterfaceFont('Noto Sans SC')).rejects.toThrow('Font unavailable')
})

it('waits for a real loaded face and propagates font decoding failures', async () => {
  const load = vi.fn().mockResolvedValue([{ status: 'loaded' }])
  vi.stubGlobal('document', { fonts: { load, check: () => true } })
  await expect(loadInterfaceFont('Noto Sans JP')).resolves.toBeUndefined()
  load.mockRejectedValueOnce(new Error('decode failed'))
  await expect(loadInterfaceFont('Noto Sans JP')).rejects.toThrow('decode failed')
})
