import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DualColumnView } from './DualColumnView'

const SEGMENTS = [
  { id: 'a', source: 'First source sentence.', target: 'First target sentence.' },
  { id: 'b', source: 'Second source sentence.', target: 'Second target sentence.' },
  { id: 'c', source: 'Third source sentence.', target: 'Third target sentence.' },
]

describe('DualColumnView 渲染结构', () => {
  it('renders both column headings', () => {
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

  it('marks the current pair without dimming other readable content', () => {
    const { container } = render(<DualColumnView segments={SEGMENTS} sourceLabel="Source" targetLabel="Translation" currentIndex={1} />)
    expect(container.querySelectorAll('[data-current="true"]')).toHaveLength(2)
    expect(container.querySelector('[data-current="true"] .bg-primary')).toBeInTheDocument()
    expect(container.querySelector('[style*="opacity"]')).not.toBeInTheDocument()
  })

  it('scopes the reading scale to the transcript', () => {
    const { container } = render(<DualColumnView segments={SEGMENTS} sourceLabel="Source" targetLabel="Translation" fontScale={1.5} />)
    expect(container.querySelector('.nola-dual__scroll')).toHaveStyle({ '--reading-scale': '1.5' })
    expect(container.querySelector('.nola-dual__headers')).not.toHaveStyle({ '--reading-scale': '1.5' })
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
    // Interim dims statically rather than blinking: no animation class.
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
    expect((separator as HTMLElement).tabIndex).toBe(0)
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
    expect(separator).toHaveAttribute('aria-valuenow', '50')

    // focus, not click: a click goes through pointerdown and starts a drag.
    separator.focus()
    await user.keyboard('{ArrowRight}')
    expect(separator).toHaveAttribute('aria-valuenow', '55')

    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(separator).toHaveAttribute('aria-valuenow', '45')

    await user.keyboard('{End}')
    expect(separator).toHaveAttribute('aria-valuenow', '85')

    await user.keyboard('{Home}')
    expect(separator).toHaveAttribute('aria-valuenow', '15')
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

    // 12 presses left from 50 would reach -10; it clamps to 15.
    for (let i = 0; i < 12; i += 1) await user.keyboard('{ArrowLeft}')
    expect(separator).toHaveAttribute('aria-valuenow', '15')

    // 20 presses right from 15 would reach 115; it clamps to 85.
    for (let i = 0; i < 20; i += 1) await user.keyboard('{ArrowRight}')
    expect(separator).toHaveAttribute('aria-valuenow', '85')
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


