import { describe, expect, it } from 'vitest'
import type { LocalRuntime, RuntimeSnapshot } from '../../../shared/compute'
import { isEngineAvailable } from './engine-availability'

const runtime = (status: LocalRuntime['status']): LocalRuntime => ({
  path: '', status, backend: '', version: '', gpuAvailable: false, reason: '',
})

const local: RuntimeSnapshot['local'] = {
  engine: runtime('missing'),
  llama: runtime('ready'),
  crisp: runtime('incompatible'),
}

describe('recommended model engine availability', () => {
  it('keeps engine buttons disabled until their loader is ready', () => {
    expect(isEngineAvailable('pytorch', local)).toBe(false)
    expect(isEngineAvailable('llama', local)).toBe(true)
    expect(isEngineAvailable('crisp', local)).toBe(false)
  })

  it('stays neutral while runtime inspection is still loading', () => {
    expect(isEngineAvailable('pytorch', null)).toBe(true)
  })
})
