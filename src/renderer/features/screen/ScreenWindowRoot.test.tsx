import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { stores } from '@/store'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { screenConfigSchema, type ScreenSnapshot, type ScreenTranslationBridge } from '../../../shared/screen-translation'
import { ScreenRegionEditor } from './ScreenWindowRoot'

const initial = stores.settings.getState()
afterEach(() => { cleanup(); stores.settings.setState(initial) })
function setup(editorShortcuts = {}) {
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN' } })
  const command = vi.fn(async () => snapshot)
  const snapshot: ScreenSnapshot = { status: 'editing', sessionId: 'fixture', epoch: 0, frames: 0, ocrMs: 0, translationMs: 0, blocks: [], shortcutError: false,
    config: screenConfigSchema.parse({ editorShortcuts, regions: [{ id: '8ddba01d-f7dd-4ea2-b24e-0a3220212420', x: 0.2, y: 0.2, width: 0.4, height: 0.4 }] }) }
  render(<ScreenRegionEditor api={{ command } as unknown as ScreenTranslationBridge} snapshot={snapshot} />)
  const region = screen.getByRole('button', { name: '翻译区域 1' })
  fireEvent.focus(region)
  return { region, command }
}

it('honors custom motion bindings and disables cleared cancel and delete bindings', () => {
  const { region, command } = setup({ left: 'Alt+J', fastLeft: 'Alt+Shift+J', cancel: '', remove: '' })
  fireEvent.keyDown(window, { key: 'ArrowLeft' })
  expect(region.style.left).toBe('20%')
  fireEvent.keyDown(window, { key: 'j', code: 'KeyJ', altKey: true })
  expect(Number.parseFloat(region.style.left)).toBeCloseTo(19.9)
  fireEvent.keyDown(window, { key: 'j', code: 'KeyJ', altKey: true, shiftKey: true })
  expect(Number.parseFloat(region.style.left)).toBeCloseTo(18.9)
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.keyDown(window, { key: 'Delete' })
  fireEvent.keyDown(window, { key: 'Backspace' })
  expect(region).toBeInTheDocument()
  expect(command).not.toHaveBeenCalled()
})

it('retains Backspace as the default delete alias', () => {
  setup()
  fireEvent.keyDown(window, { key: 'Backspace' })
  expect(screen.queryByRole('button', { name: '翻译区域 1' })).not.toBeInTheDocument()
})
