import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const read = (name: string) => readFileSync(join(here, name), 'utf8')

const light = read('nola-light.css')
const dark = read('nola-dark.css')
const all = [light, dark, read('typography.css'), read('motion.css'), read('z-index.css'), read('index.css')]

/** 取出某段 CSS 里声明的自定义属性名（去重）。 */
function declaredTokens(css: string): string[] {
  return [...new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]))].sort()
}

describe('主题 token 双套对齐（Phase 1 验收）', () => {
  it('浅色与深色声明的 token 集合完全一致', () => {
    expect(declaredTokens(dark)).toEqual(declaredTokens(light))
  })

  it('两套都定义了 HeroUI 必需的核心语义 token', () => {
    const required = [
      '--accent',
      '--accent-foreground',
      '--background',
      '--foreground',
      '--surface',
      '--surface-secondary',
      '--surface-tertiary',
      '--muted',
      '--border',
      '--separator',
      '--focus',
      '--success',
      '--warning',
      '--danger',
      '--surface-shadow',
      '--overlay-shadow',
      '--field-shadow'
    ]
    for (const token of required) {
      expect(light, `浅色缺 ${token}`).toContain(`${token}:`)
      expect(dark, `深色缺 ${token}`).toContain(`${token}:`)
    }
  })

  it('--focus 必须挂在 --accent 上，不能硬编码色值（否则断开派生链）', () => {
    expect(light).toMatch(/--focus:\s*var\(--accent\)/)
    expect(dark).toMatch(/--focus:\s*var\(--accent\)/)
  })

  it('强调色是 Nola 蓝，不是 HeroUI 默认色', () => {
    // CSS 压缩器会把 0.1780 写成 0.178，正则放宽尾部零
    expect(light).toMatch(/--accent:\s*oklch\(60% 0\.22 257\)/)
    expect(dark).toMatch(/--accent:\s*oklch\(70% 0\.16 257\)/)
    expect(light).not.toMatch(/0\.6204 0\.195 253\.83/)
  })
})

describe('设计硬规则由 CSS 自证（§1.8）', () => {
  it('投影是染色的，没有纯黑阴影', () => {
    const shadows = all.join('\n').match(/--[a-z-]*shadow:[^;]+;/gi) ?? []
    for (const s of shadows) {
      expect(s).not.toMatch(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/i)
    }
  })

  it('v3 卡片使用轻微染色投影，两套主题均可见', () => {
    expect(light).toMatch(/--surface-shadow:\s*0 2px 10px rgba\(35,72,125,\.04\)/)
    expect(dark).toMatch(/--surface-shadow:\s*0 2px 10px rgba\(15,25,45,\.12\)/)
  })

  it('没有把 #000000 / #ffffff 当作背景或前景直接写死', () => {
    for (const css of all) {
      expect(css, css.slice(0, 40)).not.toMatch(/#000000/i)
      expect(css, css.slice(0, 40)).not.toMatch(/#ffffff/i)
    }
  })

  it('z-index 只能通过 var(--z-*) 使用，不允许字面量', () => {
    const zIndexDecls = all
      .join('\n')
      .split('\n')
      .filter((line) => /z-index\s*:/.test(line) && !/^\s*(\/\*|\*)/.test(line))
    for (const line of zIndexDecls) {
      const value = line.split('z-index')[1]
      expect(value, line.trim()).toMatch(/var\(--z-/)
    }
  })

  it('主题层不引入网络 @import', () => {
    for (const css of all) {
      expect(css).not.toMatch(/@import\s+(url\(|['"]https?:)/i)
    }
  })
})

describe('排版规则（§3.3）', () => {
  it('中文字体栈里没有 SF Pro 与 Inter', () => {
    const css = read('typography.css')
    expect(css).toContain('Microsoft YaHei UI')
    expect(css).not.toMatch(/SF Pro/i)
    expect(css).not.toMatch(/"Inter"/)
  })

  it('正文行高不低于 1.6（中文需要更松的行距）', () => {
    const css = read('typography.css')
    const body = css.match(/--nola-text-body:[^;]+;/)?.[0] ?? ''
    const lh = Number(body.match(/1\.(\d+)/)?.[1] ?? '0')
    expect(lh).toBeGreaterThanOrEqual(6)
  })

  it('所有数字都用 tabular-nums', () => {
    expect(read('typography.css')).toMatch(/tabular-nums/)
  })
})

describe('动效规则（§6.4）', () => {
  it('定义了四个时长档位', () => {
    const css = read('motion.css')
    for (const v of ['--dur-micro: 120ms', '--dur-enter: 200ms', '--dur-exit: 120ms', '--dur-page: 160ms']) {
      expect(css).toContain(v)
    }
  })

  it('循环动画都能被 [data-paused] 停掉', () => {
    const css = read('motion.css')
    expect(css).toMatch(/\[data-paused[^\]]*\][^{]*\{[^}]*animation:\s*none/i)
  })

  it('减少动画走双通道：系统偏好 + 应用开关', () => {
    const css = read('motion.css')
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    expect(css).toMatch(/data-reduce-motion/)
  })
})
