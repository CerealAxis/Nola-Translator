import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/*
 * 这个测试守的是 `src/renderer/index.html`，而 index.html 已随新 UI 整体重写
 * （启动画面 + 主题预涂脚本 + Tailwind 层叠层注册）。所以断言也跟着扩了 ——
 * 新增的每一条都对应这次重写里**构建与单测都发现不了**的坑。
 */
describe('renderer content security policy', () => {
  const html = readFileSync(resolve(process.cwd(), 'src/renderer/index.html'), 'utf8')

  it('blocks remote scripts and unsafe evaluation', () => {
    expect(html).toContain('http-equiv="Content-Security-Policy"')
    expect(html).toContain("default-src 'self'")
    expect(html).toContain("script-src 'self'")
    expect(html).toContain("style-src 'self' 'unsafe-inline'")
    expect(html).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(html).not.toContain("'unsafe-eval'")
  })

  it('locks down object, base and form targets', () => {
    expect(html).toContain("object-src 'none'")
    expect(html).toContain("base-uri 'none'")
    expect(html).toContain("form-action 'none'")
  })

  it('keeps dev HMR reachable on localhost', () => {
    // 这两条是从主项目那份原样继承的。原型那版把 localhost 改成了 127.0.0.1，
    // 而 electron-vite dev 的 HMR WebSocket 连的是 localhost —— 改掉之后热更新
    // 静默失效（不报错、不红屏，只是改代码不刷新）。
    expect(html).toContain('ws://localhost:*')
    expect(html).toContain('http://localhost:*')
    expect(html).not.toContain('127.0.0.1:*')
  })

  it('has no inline script — script-src self would block it silently', () => {
    // 内联 <script> 被 CSP 拦掉时**构建通过、单测通过、也不报编译错**，
    // 只有真正跑起来时控制台才有一行 Executing inline script violates…，
    // 后果是主题预涂静默失效、深色模式每次冷启动闪一帧白底。
    //
    // 先剥掉 HTML 注释：主题预涂那段注释里正正好好写着 `<script type="module">` 作为
    // 反例说明，直接扫原文会把它当成一个内联脚本报出来（第一版就是这么假绿的）。
    const markup = html.replace(/<!--[\s\S]*?-->/g, '')
    const inlineScripts = [...markup.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter(([, attributes, body]) => !/\bsrc\s*=/.test(attributes ?? '') && (body ?? '').trim().length > 0)
    expect(inlineScripts.map((match) => match[0].slice(0, 80))).toEqual([])
  })

  it('registers the Tailwind cascade layers before any other style', () => {
    // Tailwind v4 与 HeroUI 依赖预先注册层叠层。feature 样式若先创建了这些层，
    // 基础层会被组件层盖掉（颜色与间距莫名其妙），而且不报任何错。
    const layerIndex = html.indexOf('@layer properties, theme, base, components, utilities;')
    const firstStyleIndex = html.indexOf('<style>')
    expect(layerIndex).toBeGreaterThan(-1)
    expect(firstStyleIndex).toBeGreaterThan(-1)
    expect(layerIndex).toBeGreaterThan(firstStyleIndex)
  })
})
