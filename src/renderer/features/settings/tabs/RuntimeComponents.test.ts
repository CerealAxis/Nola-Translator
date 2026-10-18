import { describe, expect, it } from 'vitest'

import { runtimeVersionRows } from './RuntimeComponents'

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
