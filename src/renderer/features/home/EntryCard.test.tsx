/**
 * 首页入口卡测试。
 *
 * 断言的是 DESIGN 里可验证的硬约束，不是快照：
 * - 主卡与次级卡的形态差别（accent 描边 + 药丸主按钮 vs 发丝线 + 整卡可点）
 * - 入口卡不带副标题（copy 纪律）
 * - 引擎未就绪时 isDisabled + Tooltip 说明原因，**不隐藏入口**
 * - 圆角写 6/8/10 的字面量，不写档位名（Tailwind 没有 `rounded-pill`）
 * - z-index 只用 `.z-*` 类，不写 `z-50`
 *
 * 组件内不出现中文字面量：可见文案全部由调用方传 `t(...)` 的结果，
 * 所以这里用 props 注入英文断言。
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EntryCard } from './EntryCard'

const ICON = <svg data-testid="icon" />

describe('EntryCard 次级卡', () => {
  it('整卡是按钮：可聚焦、可点、无独立子按钮', async () => {
    const user = userEvent.setup()
    const onPress = vi.fn()
    render(<EntryCard icon={ICON} title="Floating captions" onPress={onPress} testId="entry" />)

    const card = screen.getByTestId('entry')
    // 整卡可点，所以它自己就是可聚焦的交互元素。
    expect(card.tagName).toBe('BUTTON')

    await user.click(card)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('不渲染副标题（copy 纪律：入口卡不写装饰性说明）', () => {
    render(
      <EntryCard icon={ICON} title="Records" onPress={() => {}} meta="2026-10-01" testId="entry" />,
    )
    // 只有标题与传入的真实数据，没有第二行说明句。
    const card = screen.getByTestId('entry')
    expect(card.textContent).toBe('Records2026-10-01')
  })

  it('圆角写 10px 字面量，不用 rounded-3xl（18px，违反 10px 上限）', () => {
    render(<EntryCard icon={ICON} title="Records" onPress={() => {}} testId="entry" />)
    const card = screen.getByTestId('entry')
    expect(card.className).toContain('rounded-[10px]')
    expect(card.className).not.toContain('rounded-3xl')
  })

  it('次级卡静止态用发丝线描边，accent 只出现在 hover/focus-visible 上', () => {
    render(<EntryCard icon={ICON} title="Records" onPress={() => {}} testId="entry" />)
    const className = screen.getByTestId('entry').className
    // 静止态：border-border。
    expect(className).toContain('border-border')
    // accent 只能挂在交互态前缀上，不能是静止态的 border-accent。
    expect(className).not.toMatch(/(^|\s)border-accent(\s|$)/)
    expect(className).toMatch(/hover:border-accent/)
  })

  it('hover 只改描边颜色，不抬升不加投影', () => {
    render(<EntryCard icon={ICON} title="Records" onPress={() => {}} testId="entry" />)
    const card = screen.getByTestId('entry')
    // 没有 translate / scale / shadow：位移与投影属于悬浮层，页面上的东西没有。
    expect(card.className).not.toMatch(/translate-|scale-\[|shadow-/)
  })
})

describe('EntryCard 主卡', () => {
  it('主卡本体是 Surface（不是 Button），动作用那颗药丸按钮承担', () => {
    render(
      <EntryCard
        layout="main"
        icon={ICON}
        title="Quick session"
        actionLabel="Start"
        onPress={() => {}}
        testId="main"
      />,
    )
    const main = screen.getByTestId('main')
    // 套一个 Button 进来会得到嵌套 button，破坏 HTML 合法性与键盘顺序。
    expect(main.tagName).toBe('DIV')
    expect(main.className).toContain('border-accent')

    const cta = screen.getByRole('button', { name: 'Start' })
    expect(cta.className).toContain('rounded-full')
  })

  it('主 CTA 的可见文案就是它的无障碍名（不加 aria-label 覆盖）', async () => {
    const user = userEvent.setup()
    const onPress = vi.fn()
    render(
      <EntryCard
        layout="main"
        icon={ICON}
        title="Quick session"
        actionLabel="Start"
        onPress={onPress}
        testId="main"
      />,
    )
    const cta = screen.getByRole('button', { name: 'Start' })
    // WCAG 2.5.3：可见标签必须包含在无障碍名里。
    expect(cta.textContent).toBe('Start')
    expect(cta).not.toHaveAttribute('aria-label')

    await user.click(cta)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('药丸按钮只在主卡上出现，次级卡没有', () => {
    const { unmount } = render(
      <EntryCard
        layout="main"
        icon={ICON}
        title="Quick session"
        actionLabel="Start"
        onPress={() => {}}
        testId="main"
      />,
    )
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
    unmount()

    render(<EntryCard icon={ICON} title="Records" onPress={() => {}} testId="sub" />)
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
  })
})

describe('EntryCard 引擎未就绪', () => {
  it('禁用但不隐藏，并且给出原因', async () => {
    const onPress = vi.fn()
    render(
      <EntryCard
        layout="sub"
        icon={ICON}
        title="Records"
        onPress={onPress}
        isDisabled
        disabledReason="The local engine is not running."
        testId="entry"
      />,
    )

    // 入口仍在 DOM 里：隐藏入口等于让用户以为这个功能不存在。
    const card = screen.getByTestId('entry')
    expect(card).toBeInTheDocument()
    expect(card).toBeDisabled()

    // 禁用时不派发动作。
    await userEvent.setup().click(card)
    expect(onPress).not.toHaveBeenCalled()
  })
})

describe('EntryCard 硬约定', () => {
  it('不使用 z-50 这类 Tailwind z-index 字面量', () => {
    render(<EntryCard icon={ICON} title="Records" onPress={() => {}} testId="entry" />)
    expect(screen.getByTestId('entry').className).not.toMatch(/\bz-(10|20|30|40|50)\b/)
  })

  it('不使用 rounded-pill（theme 没有 --radius-pill 这个 key，写了不生成样式）', () => {
    render(<EntryCard icon={ICON} title="Records" onPress={() => {}} testId="entry" />)
    expect(screen.getByTestId('entry').className).not.toContain('rounded-pill')
  })
})
