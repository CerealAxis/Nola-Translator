import { describe, expect, it } from 'vitest'
import { supportErrorCodeForCause } from './error-catalog'

describe('support error code mapping', () => {
  it('maps the resourceNotFound engine error to the missing-resource support code', () => {
    expect(supportErrorCodeForCause('resourceNotFound')).toBe('MDL-023')
  })
})
