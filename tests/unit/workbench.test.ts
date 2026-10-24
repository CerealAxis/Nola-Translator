import { describe, expect, it } from 'vitest'
import { workbenchSurface } from '../../src/shared/workbench'

describe('agent workbench surface', () => {
  it('accepts the supported conversation surface in production and development', () => {
    expect(workbenchSurface('chat')).toBe('chat')
    for (const value of [undefined, null, 'voices', 'https://example.com', {}]) {
      expect(workbenchSurface(value)).toBeNull()
    }
  })
})
