import { expect, it } from 'vitest'
import { electronShortcut, isSupportedShortcut, matchesShortcut, normalizeShortcut, shortcutFromEvent } from './keyboard-shortcuts'
import { meetingModeSettingsSchema, DEFAULT_MEETING_MODE } from './meeting-mode'

it('captures combinations, punctuation and layout-aware letter keys', () => {
  expect(shortcutFromEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true }))).toBe('Control+Shift+K')
  expect(shortcutFromEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyY', altKey: true }))).toBe('Alt+Z')
  expect(shortcutFromEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', ctrlKey: true }))).toBe('Control+Comma')
  expect(electronShortcut('Control+Comma')).toBe('Control+,')
  expect(shortcutFromEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }))).toBeNull()
  expect(shortcutFromEvent(new KeyboardEvent('keydown', { key: 'a', isComposing: true }))).toBeNull()
})

it('normalizes aliases and matches exact modifiers', () => {
  expect(normalizeShortcut('Shift+Ctrl+F8')).toBe(normalizeShortcut('CommandOrControl+Shift+F8'))
  expect(normalizeShortcut('CommandOrControl+K', true)).toBe(normalizeShortcut('Super+K'))
  expect(matchesShortcut('', new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(false)
  expect(matchesShortcut('F9', new KeyboardEvent('keydown', { key: 'F9', ctrlKey: true }))).toBe(false)
  expect(matchesShortcut('Shift+Left', new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }))).toBe(true)
})

it('validates and persists disabled or custom meeting shortcuts', () => {
  for (const value of ['', 'F9', 'Control+Shift+K', 'Alt+Comma']) {
    expect(meetingModeSettingsSchema.safeParse({ ...DEFAULT_MEETING_MODE, passthroughKey: value }).success).toBe(true)
  }
  for (const value of ['Control', 'Control+Ctrl+K', 'F25', 'Control+Unknown', 'A+B']) expect(isSupportedShortcut(value)).toBe(false)
})
