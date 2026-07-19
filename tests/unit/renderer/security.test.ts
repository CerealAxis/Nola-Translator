import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('renderer content security policy', () => {
  it('blocks remote scripts and unsafe evaluation', () => {
    const html = readFileSync(resolve(process.cwd(), 'src/renderer/index.html'), 'utf8')

    expect(html).toContain('http-equiv="Content-Security-Policy"')
    expect(html).toContain("default-src 'self'")
    expect(html).toContain("script-src 'self'")
    expect(html).toContain("style-src 'self' 'unsafe-inline'")
    expect(html).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(html).not.toContain("'unsafe-eval'")
  })
})
