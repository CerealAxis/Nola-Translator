import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from '../../../src/renderer/app/App'

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

  it('navigates to translation, appearance, and history pages', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect(screen.getByRole('heading', { name: 'Argos 本地语言包' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '外观' }))
    expect(screen.getByRole('heading', { name: '字幕样式' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '历史记录' }))
    expect(screen.getByText('默认不保存任何字幕内容。')).toBeInTheDocument()
  })

  it('navigates to recognition and diagnostics pages', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '语音识别' }))
    expect(screen.getByRole('heading', { name: '实时模式' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '诊断' }))
    expect(await screen.findByText('引擎状态')).toBeInTheDocument()
    expect(screen.getByText('ready')).toBeInTheDocument()
  })
})
