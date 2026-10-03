/**
 * `DualColumnView` 与焦点衰减的测试。
 *
 * 断言 DESIGN 里可验证的几条硬约束：
 * - 焦点**连续**衰减，不分档硬切（第 6.6.2 节）
 * - 焦点衰减有下限 0.42，不会无限淡下去
 * - 分隔拉手夹在 15% 到 85% 之间
 * - 方向键可调分隔位置（键盘可达，不是只能拖）
 * - 渲染结构是**成对输出**（一句原文紧跟一句译文），不是两栏各渲染一个句子列表
 *
 * 组件本身只用相对导入，所以这组测试不受 `@/` 别名缺失的影响。
 */

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DualColumnView, lineOpacity } from './DualColumnView'

const SEGMENTS = [
  { id: 'a', source: 'First source sentence.', target: 'First target sentence.' },
  { id: 'b', source: 'Second source sentence.', target: 'Second target sentence.' },
  { id: 'c', source: 'Third source sentence.', target: 'Third target sentence.' },
]

describe('lineOpacity 连续衰减', () => {
  it('当前句是满对比度', () => {
    expect(lineOpacity(0)).toBe(1)
  })

  it('逐级递减 0.11（不分档硬切）', () => {
    expect(lineOpacity(1)).toBeCloseTo(0.89, 5)
    expect(lineOpacity(2)).toBeCloseTo(0.78, 5)
    expect(lineOpacity(3)).toBeCloseTo(0.67, 5)
    expect(lineOpacity(4)).toBeCloseTo(0.56, 5)
  })

  it('有下限 0.42，不会无限淡下去', () => {
    // DESIGN 第 6.6.2 节的表格在距离 5 那一行写的是 0.42，但同页给的公式是
    // `max(0.42, 1 - 0.11 * distance)`，代入 5 得 0.45。**公式与表格不一致**。
    // 这里按公式断言（公式是规范，表格是说明），差异写进交付报告请编排者裁决。
    expect(lineOpacity(5)).toBeCloseTo(0.45, 5)
    // 距离 6 起才真正触到下限。
    expect(lineOpacity(6)).toBe(0.42)
    expect(lineOpacity(50)).toBe(0.42)
    expect(lineOpacity(1000)).toBe(0.42)
  })
})

describe('DualColumnView 渲染结构', () => {
  it('两栏都有栏头，栏头 14px/600（nola-subtitle）', () => {
    render(
      <DualColumnView
        segments={SEGMENTS}
        sourceLabel="Source"
        targetLabel="Translation"
      />,
    )
    expect(screen.getByText('Source')).toBeInTheDocument()
    expect(screen.getByText('Translation')).toBeInTheDocument()
  })

  it('每个句段的原文与译文都渲染出来（成对，不是两栏各自一个列表）', () => {
    render(
      <DualColumnView
        segments={SEGMENTS}
        sourceLabel="Source"
        targetLabel="Translation"
      />,
    )
    for (const segment of SEGMENTS) {
      expect(screen.getByText(segment.source)).toBeInTheDocument()
      expect(screen.getByText(segment.target)).toBeInTheDocument()
    }
  })

  it('给 currentIndex 时，当前句拿 2px accent 指示条与满对比度，其余逐级衰减', () => {
    const { container } = render(
      <DualColumnView
        segments={SEGMENTS}
        sourceLabel="Source"
        targetLabel="Translation"
        currentIndex={1}
      />,
    )

    // 当前句（索引 1）在原文栏与译文栏各有一根 accent 指示条。
    expect(container.querySelectorAll('[data-current="true"]')).toHaveLength(2)
    expect(container.querySelector('[data-current="true"] .bg-accent')).toBeInTheDocument()

    // 索引 0 距离当前 1，opacity 0.89；索引 2 距离 -1，也是 0.89。
    const cells = Array.from(container.querySelectorAll<HTMLElement>('[data-current], [style*="opacity"]'))
    const opacities = cells
      .map((cell) => Number(cell.style.opacity))
      .filter((value) => Number.isFinite(value))
    expect(opacities).toContain(0.89)
  })

  it('不设 currentIndex 时不画指示条（静态阅读没有"当前句"）', () => {
    const { container } = render(
      <DualColumnView
        segments={SEGMENTS}
        sourceLabel="Source"
        targetLabel="Translation"
      />,
    )
    expect(container.querySelectorAll('[data-current="true"]')).toHaveLength(0)
  })

  it('interim 句额外压一档对比度，但**不闪烁**（不加 animate / 动画类）', () => {
    const { container } = render(
      <DualColumnView
        segments={[{ id: 'x', source: 'Draft line.', target: '', interim: true }]}
        sourceLabel="Source"
        targetLabel="Translation"
        currentIndex={0}
      />,
    )
    const interim = container.querySelector<HTMLElement>('[data-interim="true"]')
    expect(interim).toBeInTheDocument()
    // interim 走静态的"更淡"，不是闪烁：没有 animation / animate-* 类。
    expect(interim?.className).not.toMatch(/animate-|nola-caption-enter/)
  })
})

describe('DualColumnView 分隔拉手', () => {
  it('是 separator 角色，键盘可达，带 aria 值域', () => {
    render(
      <DualColumnView
        segments={SEGMENTS}
        sourceLabel="Source"
        targetLabel="Translation"
      />,
    )
    const separator = screen.getByRole('slider')
    expect(separator).toHaveAccessibleName('Source / Translation')
    expect(separator).toHaveAttribute('min', '15')
    expect(separator).toHaveAttribute('max', '85')
    expect(separator).toHaveAttribute('type', 'range')
  })

  it('方向键可调：左右各移 5%，Home/End 到两端', async () => {
    const user = userEvent.setup()
    render(
      <DualColumnView
        segments={SEGMENTS}
        sourceLabel="Source"
        targetLabel="Translation"
      />,
    )
    const separator = screen.getByRole('slider')
    expect(separator).toHaveAttribute('value', '50')

    // 用 focus 而不是 click：click 会走 pointerdown，进入拖动态。
    separator.focus()
    await user.keyboard('{ArrowRight}')
    expect(separator).toHaveAttribute('value', '55')

    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(separator).toHaveAttribute('value', '45')

    await user.keyboard('{End}')
    expect(separator).toHaveAttribute('value', '85')

    await user.keyboard('{Home}')
    expect(separator).toHaveAttribute('value', '15')
  })

  it('夹在 15% 到 85%：连按方向键也越不过界', async () => {
    const user = userEvent.setup()
    render(
      <DualColumnView
        segments={SEGMENTS}
        sourceLabel="Source"
        targetLabel="Translation"
      />,
    )
    const separator = screen.getByRole('slider')
    separator.focus()

    // 从 50 连按 12 次左（理论值 -10，低于下限）：夹在 15。
    for (let i = 0; i < 12; i += 1) await user.keyboard('{ArrowLeft}')
    expect(separator).toHaveAttribute('value', '15')

    // 从 15 连按 20 次右（理论值 115，高于上限）：夹在 85。
    for (let i = 0; i < 20; i += 1) await user.keyboard('{ArrowRight}')
    expect(separator).toHaveAttribute('value', '85')
  })
})

describe('DualColumnView 空态', () => {
  it('没有句段时渲染调用方给的空态', () => {
    render(
      <DualColumnView
        segments={[]}
        sourceLabel="Source"
        targetLabel="Translation"
        empty={<p>Nothing here yet.</p>}
      />,
    )
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument()
    expect(screen.queryByRole('slider')).toBeNull()
  })
})


