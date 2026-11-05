import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { stores } from '@/store'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { LanguageDirectionSelect, languageOptionLabel } from './LanguageDirectionSelect'

const initial = stores.settings.getState()
afterEach(() => { cleanup(); stores.settings.setState(initial) })

it('labels languages with localized and native names while keeping pseudo-languages readable', () => {
  expect(languageOptionLabel('zh', 'zh-CN')).toBe('简体中文')
  expect(languageOptionLabel('zh-TW', 'zh-CN')).toBe('繁体中文 (繁體中文)')
  expect(languageOptionLabel('en', 'zh-CN')).toBe('英语 (English)')
  expect(languageOptionLabel('ja', 'en')).toBe('Japanese (日本語)')
  expect(languageOptionLabel('auto', 'zh-CN')).toBe('自动检测')
  expect(languageOptionLabel('none', 'en')).toBe('No translation')
  expect(languageOptionLabel('en', 'en')).toBe('English')
  expect(languageOptionLabel('en', 'zh-CN', false)).toBe('英语')
  expect(() => languageOptionLabel('unknown_code', 'en')).not.toThrow()
})

it('keeps selected names compact and complete names available in the picker', () => {
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN' } })
  render(<LanguageDirectionSelect source="en" target="zh" sourceCodes={['en']} targetCodes={['zh']}
    onSourceChange={vi.fn()} onTargetChange={vi.fn()} />)
  expect(screen.getByRole('combobox', { name: '原文语言' })).toHaveTextContent(/^英语$/)
  expect(screen.getByRole('combobox', { name: '原文语言' })).toHaveAttribute('title', '英语 (English)')
  expect(screen.getByRole('combobox', { name: '译文语言' })).toHaveTextContent(/^简体中文$/)
})

it('filters by either language name, handles no matches and restores choices after clearing', async () => {
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN' } })
  const change = vi.fn(), swap = vi.fn()
  render(<LanguageDirectionSelect source="auto" target="en" sourceCodes={['auto', 'zh', 'en', 'ja']} targetCodes={['zh', 'en']}
    onSourceChange={change} onTargetChange={vi.fn()} onSwap={swap} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '原文语言' }))
  const search = await screen.findByRole('combobox', { name: '搜索语言…' })
  expect(search).not.toHaveFocus()
  expect(screen.getByRole('combobox', { name: '原文语言' })).toHaveFocus()
  expect(search).toHaveAttribute('data-slot', 'input')
  await user.type(search, 'English')
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['英语 (English)'])
  await user.clear(search)
  await user.type(search, '日语')
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['日语 (日本語)'])
  await user.clear(search)
  await user.type(search, 'zzzz')
  expect(screen.queryByRole('option')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('没有匹配的语言')
  await user.clear(search)
  expect(screen.getAllByRole('option')).toHaveLength(4)
  await user.click(screen.getByRole('option', { name: '英语 (English)' }))
  await waitFor(() => expect(change).toHaveBeenCalledWith('en'))
  fireEvent.click(screen.getByRole('button', { name: '交换语言' }))
  expect(swap).toHaveBeenCalledOnce()
})

it('keeps search keyboard-accessible and returns focus when dismissed', async () => {
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN' } })
  render(<LanguageDirectionSelect source="auto" target="en" sourceCodes={['auto', 'zh', 'en']} targetCodes={['en']}
    onSourceChange={vi.fn()} onTargetChange={vi.fn()} />)
  const user = userEvent.setup()
  const trigger = screen.getByRole('combobox', { name: '原文语言' })
  trigger.focus()
  await user.keyboard('{ArrowDown}')
  const search = await screen.findByRole('combobox', { name: '搜索语言…' })
  await user.tab()
  await waitFor(() => expect(search).toHaveFocus())
  await user.keyboard('{Escape}')
  await waitFor(() => expect(trigger).toHaveFocus())
})
