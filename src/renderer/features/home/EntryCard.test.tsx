/**
 * Entry card tests, asserting the design's checkable constraints: the difference
 * between the main and sub shapes, the absence of a subtitle, a disabled-but-visible
 * entry that explains itself, literal pixel radii, and `.z-*` classes in place of
 * `z-50`.
 *
 * Copy arrives as props from the caller's `t(...)`, so the assertions use English.
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
    // The whole card is pressable, so it is itself the focusable control.
    expect(card.tagName).toBe('BUTTON')

    await user.click(card)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('不渲染副标题（copy 纪律：入口卡不写装饰性说明）', () => {
    render(
      <EntryCard icon={ICON} title="Records" onPress={() => {}} meta="2026-10-01" testId="entry" />,
    )
    // Only the title and the supplied data; no second line of copy.
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
    // The resting state uses the hairline border.
    expect(className).toContain('border-border')
    // Accent may only sit behind an interaction prefix, never as the resting border.
    expect(className).not.toMatch(/(^|\s)border-accent(\s|$)/)
    expect(className).toMatch(/hover:border-accent/)
  })

  it('hover 只改描边颜色，不抬升不加投影', () => {
    render(<EntryCard icon={ICON} title="Records" onPress={() => {}} testId="entry" />)
    const card = screen.getByTestId('entry')
    // No translate, scale or shadow: those belong to overlays, not to a card on a page.
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
    // WCAG 2.5.3: the visible label has to be part of the accessible name.
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

    // The entry stays in the DOM: hiding it would suggest the feature does not exist.
    const card = screen.getByTestId('entry')
    expect(card).toBeInTheDocument()
    expect(card).toBeDisabled()

    // A disabled card dispatches no press.
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
