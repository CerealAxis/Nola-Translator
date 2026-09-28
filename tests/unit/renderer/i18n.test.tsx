import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { App } from '../../../src/renderer/app/App'
import { CaptionOverlay } from '../../../src/renderer/overlay/CaptionOverlay'
import { I18nProvider } from '../../../src/renderer/i18n'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import type { EngineEvent } from '../../../src/shared/contracts'

describe('界面语言切换', () => {
  it('标题栏菜单切换 English 更新页面，并可切回中文', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '实时字幕', level: 1 })
    fireEvent.click(screen.getByRole('button', { name: '界面语言' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'English' }))
    await waitFor(() => expect(document.documentElement.lang).toBe('en'))

    expect(screen.getByRole('heading', { name: 'Live captions', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start captions' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(screen.getByRole('heading', { name: 'Subtitle style' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Interface language' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '中文' }))
    await waitFor(() => expect(document.documentElement.lang).toBe('zh-CN'))
    expect(screen.getByRole('heading', { name: '字幕样式' })).toBeInTheDocument()
  })

  it('保存失败时回滚语言并显示错误提示', async () => {
    const api = window.fluentCaptions!
    const updateSettings = vi.spyOn(api, 'updateSettings').mockRejectedValueOnce(new Error('disk full'))
    render(<App />)
    await screen.findByRole('heading', { name: '实时字幕', level: 1 })
    fireEvent.click(screen.getByRole('button', { name: '界面语言' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'English' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('语言设置保存失败，请重试。'))
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(screen.getByRole('heading', { name: '实时字幕', level: 1 })).toBeInTheDocument()
    updateSettings.mockRestore()
  })

  it('英文界面下字幕正文保持原文', async () => {
    const api = window.fluentCaptions!
    vi.spyOn(api, 'getSettings').mockResolvedValue({ ...DEFAULT_SETTINGS, uiLanguage: 'en' })
    let listener: ((event: EngineEvent) => void) | undefined
    vi.spyOn(api, 'onEngineEvent').mockImplementation((next) => {
      listener = next
      return () => undefined
    })

    render(<I18nProvider><CaptionOverlay /></I18nProvider>)
    await waitFor(() => expect(document.documentElement.lang).toBe('en'))

    act(() => {
      listener?.({
        protocolVersion: 1,
        type: 'caption',
        requestId: 'caption-i18n',
        sessionId: 'session-live',
        segment: {
          segmentId: 'segment-i18n',
          revision: 1,
          startedAtMs: 0,
          sourceText: '你好，世界。',
          isFinal: true,
          translations: [],
        },
      })
    })

    expect(screen.getByText('你好，世界。')).toBeInTheDocument()
  })
})
