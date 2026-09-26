import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { App } from '../../../src/renderer/app/App'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'

describe('App', () => {
  it('renders the primary caption session controls', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '实时字幕', level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText('音频来源')).toBeInTheDocument()
    expect(screen.getByLabelText('识别模式')).toBeInTheDocument()
    expect(screen.getByLabelText('源语言')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '目标语言（可多选）' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始字幕' })).toBeInTheDocument()
    expect(screen.getByText('开始会话后，识别原文会显示在这里。')).toBeInTheDocument()
  })

  it('changes session state when the user starts and stops captions', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '开始字幕' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('正在监听音频'))
    expect(screen.getByRole('button', { name: '停止字幕' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '停止字幕' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('准备就绪'))
  })

  it('keeps a global stop action available after navigating away from captions', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '开始字幕' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('正在监听音频'))
    fireEvent.click(screen.getByRole('button', { name: '外观' }))

    expect(screen.getByRole('button', { name: '停止字幕服务' })).toBeInTheDocument()
  })

  it('navigates to translation, appearance, and history pages', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect(screen.getByRole('heading', { name: 'Argos 本地语言包' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '外观' }))
    expect(screen.getByRole('heading', { name: '字幕样式' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '历史记录' }))
    expect(screen.getByText('默认不保存任何字幕内容。')).toBeInTheDocument()
  })

  it('offers explicit controls to hide and adjust the subtitle overlay', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '外观' }))

    expect(screen.getByRole('button', { name: '隐藏浮层' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '调整位置和大小' })).toBeInTheDocument()
  })

  it('hides the overlay and enters free unlocked adjustment mode', async () => {
    const api = window.fluentCaptions!
    const hideOverlay = vi.spyOn(api, 'hideOverlay')
    const showOverlay = vi.spyOn(api, 'showOverlay')
    const updateSettings = vi.spyOn(api, 'updateSettings').mockImplementation(async (patch) => ({
      ...DEFAULT_SETTINGS,
      ...patch,
      recognition: { ...DEFAULT_SETTINGS.recognition, ...patch.recognition },
      overlay: { ...DEFAULT_SETTINGS.overlay, ...patch.overlay },
      translation: { ...DEFAULT_SETTINGS.translation, ...patch.translation },
    }))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '外观' }))

    fireEvent.click(screen.getByRole('button', { name: '隐藏浮层' }))
    await waitFor(() => expect(hideOverlay).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: '调整位置和大小' }))
    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ overlay: { mode: 'free', locked: false } })
      expect(showOverlay).toHaveBeenCalledOnce()
    })

    hideOverlay.mockRestore()
    showOverlay.mockRestore()
    updateSettings.mockRestore()
  })

  it('navigates to recognition and diagnostics pages', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '语音识别' }))
    expect(screen.getByRole('heading', { name: '实时模式' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '诊断' }))
    expect(await screen.findByText('引擎状态')).toBeInTheDocument()
    expect(screen.getByText('ready')).toBeInTheDocument()
  })

  it('shows a dedicated resource page and a labeled Argos routing switch', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '模型与语言包' }))
    expect(screen.getByRole('heading', { name: '模型与语言包', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('实时识别')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect(screen.getByRole('checkbox', { name: '允许经 English 中转' })).toBeInTheDocument()
  })
})
