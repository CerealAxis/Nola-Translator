import { describe, expect, it } from 'vitest'

import { isExternalRuntime, runtimeVersionRows } from './RuntimeComponents'

const ready = (version: string) => ({
  path: '', status: 'ready' as const, backend: 'cpu', version, gpuAvailable: false, reason: '',
})

const missing = () => ({
  path: '', status: 'missing' as const, backend: '', version: '', gpuAvailable: false, reason: '',
})

describe('runtimeVersionRows', () => {
  it('only returns versions from runtimes that are ready to use', () => {
    expect(runtimeVersionRows({ engine: ready('2.4.1'), llama: { ...missing(), status: 'incompatible', version: 'b123' }, crisp: ready('') })).toEqual([
      { kind: 'engine', version: '2.4.1' },
    ])
  })

  it('returns no rows when runtime versions are unavailable', () => {
    expect(runtimeVersionRows({ engine: missing(), llama: missing() })).toEqual([])
  })
})

describe('isExternalRuntime', () => {
  it('does not label bundled runtimes as external environments', () => {
    expect(isExternalRuntime({ ...ready('0.8.43'), bundled: true })).toBe(false)
  })

  it('labels unmanaged runtimes from outside the app as external', () => {
    expect(isExternalRuntime({ ...ready('0.8.43'), managed: false })).toBe(true)
  })
})
