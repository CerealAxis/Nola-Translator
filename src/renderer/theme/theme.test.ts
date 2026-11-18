import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const product = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'product.css'), 'utf8')
const typography = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'typography.css'), 'utf8')

describe('product design contracts', () => {
  it('keeps system and code font stacks independent of optional CJK fonts', () => {
    expect(typography).toContain('--font-ui: var(--nola-font-family, var(--font-system))')
    expect(typography).toMatch(/--font-code:\s*ui-monospace/)
    expect(typography).not.toContain('--font-cjk-fallback')
    expect(product).not.toMatch(/font-weight:\s*(550|650|700)\b/)
  })

  it('requires explicit scene opt-in for glass', () => {
    const glass = product.slice(product.indexOf('@supports (backdrop-filter:'))
      .split('/* ===== 公共控件补充样式 ===== */')[0]
    expect(glass).toContain('[data-material="glass"]')
    expect(glass).not.toMatch(/\[data-slot=|\.card\b|\.sidebar\b/)
    expect(glass).toContain('prefers-reduced-transparency: reduce')
  })

  it('keeps density overrides independent of typography', () => {
    const density = product.match(/\[data-density="comfortable"\]\s*\{([^}]+)\}/)?.[1]
    expect(density).toBeTruthy()
    expect(density).not.toMatch(/font|line-height|letter-spacing|--text-/)
    expect(product.match(/--radius-button:/g)).toHaveLength(1)
  })

  it('supports system and application reduced motion and paused indicators', () => {
    expect(product).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    expect(product).toContain('data-reduce-motion')
    expect(product).toMatch(/\[data-paused[^\]]*\][^{]*\{[^}]*animation:\s*none/i)
    expect(product).not.toMatch(/@import\s+(url\(|['"]https?:)/i)
  })
})
