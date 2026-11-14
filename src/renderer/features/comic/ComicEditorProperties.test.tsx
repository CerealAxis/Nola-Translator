import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComicRegion } from '../../../shared/comic'
import { ComicCharacterControls, ComicPropertiesSection, ComicTypeOptions } from './ComicEditorProperties'

afterEach(cleanup)
const style: ComicRegion['style'] = { fontSize: 24, color: '#112233', direction: 'horizontal', align: 'center' }
const fontControl = (slot: 'toolbar' | 'properties') => <button type="button">{slot} font</button>

describe('comic type properties', () => {
  it('keeps independent sections accessible and sends style edits to the selected object', async () => {
    const onChange = vi.fn()
    render(<ComicCharacterControls style={style} onChange={onChange} fontControl={fontControl} childrenTransform={<span>geometry</span>} />)
    expect(screen.queryByText('geometry')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '变换' }))
    expect(screen.getByText('geometry')).toBeVisible()
    expect(screen.getByRole('button', { name: 'properties font' })).toBeVisible()
    fireEvent.change(screen.getByRole('spinbutton', { name: '字号' }), { target: { value: '64' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...style, fontSize: 64, autoFontSize: false })
    fireEvent.change(screen.getByRole('spinbutton', { name: '行距' }), { target: { value: '1.5' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...style, lineSpacing: 1.5 })
    await userEvent.click(screen.getByRole('button', { name: '字符' }))
    expect(screen.queryByRole('spinbutton', { name: '字号' })).toBeNull()
    expect(screen.getByRole('button', { name: '段落' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('uses separate font slots and exposes commit and cancel only for an active session', async () => {
    const onChange = vi.fn(), onCommit = vi.fn(), onCancel = vi.fn()
    const view = render(<ComicTypeOptions style={style} onChange={onChange} fontControl={fontControl} editing onCommit={onCommit} onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: 'toolbar font' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '左对齐' }))
    expect(onChange).toHaveBeenCalledWith({ ...style, align: 'left' })
    await userEvent.click(screen.getByRole('button', { name: '保存' })); await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCommit).toHaveBeenCalledOnce(); expect(onCancel).toHaveBeenCalledOnce()
    view.rerender(<ComicTypeOptions style={style} onChange={onChange} fontControl={fontControl} editing={false} onCommit={onCommit} onCancel={onCancel} />)
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
  })

  it('writes color, stroke and direction changes through the same style callback', async () => {
    const onChange = vi.fn()
    render(<ComicCharacterControls style={style} onChange={onChange} fontControl={fontControl} />)
    await userEvent.click(screen.getByRole('button', { name: '文字颜色' }))
    fireEvent.change(await screen.findByRole('textbox', { name: '文字颜色 · HEX' }), { target: { value: '#FF0000' } })
    expect(onChange).toHaveBeenCalledWith({ ...style, color: '#FF0000' })
    fireEvent.keyDown(screen.getByRole('textbox', { name: '文字颜色 · HEX' }), { key: 'Escape' })
    fireEvent.change(screen.getByRole('spinbutton', { name: '宽度' }), { target: { value: '3' } })
    expect(onChange).toHaveBeenCalledWith({ ...style, strokeWidth: 3 })
    fireEvent.keyDown(screen.getByRole('combobox', { name: '文字方向' }), { key: 'ArrowDown' })
    await userEvent.click(await screen.findByRole('option', { name: '竖排' }))
    expect(onChange).toHaveBeenCalledWith({ ...style, direction: 'vertical-rl' })
  })

  it('disables editing controls without hiding their values', () => {
    const onChange = vi.fn()
    render(<ComicCharacterControls style={{ ...style, autoFontSize: true }} onChange={onChange} disabled fontControl={fontControl} />)
    const size = screen.getByRole('spinbutton', { name: '字号' })
    expect(size).toBeDisabled(); expect(size).toHaveAttribute('placeholder', '自动')
    expect(within(screen.getByRole('group', { name: '文字对齐' })).getAllByRole('button').every(button => button.hasAttribute('disabled'))).toBe(true)
  })

  it('allows the host to reuse a section for document properties', async () => {
    render(<ComicPropertiesSection title="Document"><span>dimensions</span></ComicPropertiesSection>)
    await userEvent.click(screen.getByRole('button', { name: 'Document' }))
    expect(screen.queryByText('dimensions')).toBeNull()
  })
})
