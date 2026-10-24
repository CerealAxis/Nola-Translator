import { describe, expect, it } from 'vitest'
import { localCallDemoSurface } from '../../src/shared/local-call-demo'

describe('development playground boundary', () => {
  it('only accepts the local development chat surface', () => {
    expect(localCallDemoSurface(false, 'http://localhost:5173', 'chat')).toBe('chat')
    expect(localCallDemoSurface(false, 'http://127.0.0.1:5173', 'chat')).toBe('chat')
    for (const url of [undefined, 'file:///preview.html', 'https://example.com', 'bad-url']) {
      expect(localCallDemoSurface(false, url, 'chat')).toBeNull()
    }
    expect(localCallDemoSurface(true, 'http://localhost:5173', 'chat')).toBeNull()
    expect(localCallDemoSurface(false, 'http://localhost:5173', 'voices')).toBeNull()
  })
})
