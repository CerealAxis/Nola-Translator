import { createRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ComicRegion } from '../../../shared/comic'
import { ComicTextEditor, codePointsToUtf16, rebaseTextRuns, utf16ToCodePoints, type ComicTextEditorHandle } from './ComicTextEditor'

describe('comic text editing offsets', () => {
  it('converts between DOM offsets and Unicode code points', () => {
    expect(utf16ToCodePoints('a😀文', 3)).toBe(2)
    expect(codePointsToUtf16('a😀文', 2)).toBe(3)
  })
  it('keeps formatting attached to characters across insertions and deletions', () => {
    const runs = [{ start: 1, end: 3, style: { color: '#ff0000' } }]
    expect(rebaseTextRuns('a😀文z', 'a😀新文z', runs)).toEqual([{ start: 1, end: 4, style: { color: '#ff0000' } }])
    expect(rebaseTextRuns('a😀文z', 'a文z', runs)).toEqual([{ start: 1, end: 2, style: { color: '#ff0000' } }])
  })
})

describe('comic canvas text session', () => {
  const region = { targetText: 'a😀文', x: 10, y: 20, width: 200, height: 100,
    style: { fontSize: 24, color: '#000000', direction: 'vertical-rl', align: 'center', angle: 10 } } as ComicRegion
  it('applies style to the selected characters and preserves their Unicode offsets', () => {
    const ref = createRef<ComicTextEditorHandle>(), onChange = vi.fn()
    render(<ComicTextEditor ref={ref} region={region} scale={0.5} label="Text" onChange={onChange} onCommit={vi.fn()} onCancel={vi.fn()} />)
    const editor = screen.getByRole('textbox'), text = editor.querySelector('span')!.firstChild!
    const range = document.createRange(); range.setStart(text, 1); range.setEnd(text, 3)
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); fireEvent.pointerUp(editor)
    act(() => ref.current!.applyStyle({ color: '#ff0000' }))
    expect(onChange).toHaveBeenLastCalledWith({ text: 'a😀文', runs: [{ start: 1, end: 2, style: { color: '#ff0000' } }] })
    expect(editor.style.writingMode).toBe('vertical-rl')
    expect(editor.style.transform).toContain('scale(0.5)')
  })
  it('waits for IME composition before notifying and does not treat Escape during composition as cancel', () => {
    const onChange = vi.fn(), onCancel = vi.fn()
    render(<ComicTextEditor region={region} scale={1} label="Text" onChange={onChange} onCommit={vi.fn()} onCancel={onCancel} />)
    const editor = screen.getByRole('textbox')
    fireEvent.compositionStart(editor); editor.textContent = '日本'; fireEvent.input(editor)
    fireEvent.keyDown(editor, { key: 'Escape', isComposing: true }); expect(onCancel).not.toHaveBeenCalled(); expect(onChange).not.toHaveBeenCalled()
    fireEvent.compositionEnd(editor); expect(onChange).toHaveBeenCalledWith({ text: '日本', runs: [] })
  })
  it('restores the original text and runs on cancel and uses resolved layout geometry', () => {
    const onChange = vi.fn(), onCancel = vi.fn(), runs = [{ start: 0, end: 1, style: { color: '#ff0000' } }]
    const resolvedLayout = { text: 'a😀文', x: 30, y: 40, width: 160, height: 80, fontSize: 20, lineHeight: 24, lines: ['a😀文'], direction: 'horizontal' as const, angle: 0 }
    render(<ComicTextEditor region={{ ...region, resolvedLayout }} runs={runs} scale={0.5} label="Text" onChange={onChange} onCommit={vi.fn()} onCancel={onCancel} />)
    const editor = screen.getByRole('textbox'); expect(editor.style.left).toBe('15px'); expect(editor.style.fontSize).toBe('20px')
    editor.textContent = 'changed'; fireEvent.input(editor); onChange.mockClear(); fireEvent.keyDown(editor, { key: 'Escape' })
    expect(onChange).not.toHaveBeenCalled(); expect(onCancel).toHaveBeenCalledOnce()
  })
  it('uses resolved soft breaks without changing the underlying text', () => {
    const resolvedLayout = { text: 'a😀文', x: 10, y: 20, width: 200, height: 100, fontSize: 20, lineHeight: 24, lines: ['a😀', '文'], direction: 'horizontal' as const, angle: 0 }
    render(<ComicTextEditor region={{ ...region, resolvedLayout }} scale={1} label="Text" onChange={vi.fn()} onCommit={vi.fn()} onCancel={vi.fn()} />)
    const editor = screen.getByRole('textbox'); expect(editor.querySelectorAll('br')).toHaveLength(1); expect(editor.textContent).toBe('a😀文')
  })
  it('updates soft breaks from live layout while keeping the selected characters', async () => {
    const base = { text: 'a😀文', x: 10, y: 20, width: 200, height: 100, fontSize: 20, lineHeight: 24, lines: ['a😀', '文'], direction: 'horizontal' as const, angle: 0 }
    const props = { region: { ...region, resolvedLayout: base }, scale: 1, label: 'Text', onChange: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn() }
    const view = render(<ComicTextEditor {...props} />), editor = screen.getByRole('textbox'), first = editor.querySelector('span')!.firstChild!
    const range = document.createRange(); range.setStart(first, 1); range.setEnd(first, 3)
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); fireEvent.pointerUp(editor)
    view.rerender(<ComicTextEditor {...props} liveLayout={{ ...base, lines: ['a', '😀文'] }} />)
    expect([...editor.childNodes].map(node => node.nodeName === 'BR' ? '|' : node.textContent).join('')).toBe('a|😀文')
    expect(window.getSelection()!.toString()).toBe('😀')
  })
  it('does not replace the composition DOM when a layout arrives during IME input', () => {
    const layout = { text: 'a😀文', x: 10, y: 20, width: 200, height: 100, fontSize: 20, lineHeight: 24, lines: ['a', '😀文'], direction: 'horizontal' as const, angle: 0 }
    const props = { region, scale: 1, label: 'Text', onChange: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn() }
    const view = render(<ComicTextEditor {...props} />), editor = screen.getByRole('textbox')
    fireEvent.compositionStart(editor); editor.textContent = '編集中'
    view.rerender(<ComicTextEditor {...props} liveLayout={layout} />)
    expect(editor.textContent).toBe('編集中')
    fireEvent.compositionEnd(editor)
    expect(props.onChange).toHaveBeenCalledWith({ text: '編集中', runs: [] })
  })
  it('keeps the initial fitted size when editing clears resolved layout, but follows an explicit size change', () => {
    const resolvedLayout = { text: 'a😀文', x: 10, y: 20, width: 200, height: 100, fontSize: 36, lineHeight: 42, lines: ['a😀文'], direction: 'horizontal' as const, angle: 0 }
    const props = { region: { ...region, resolvedLayout }, scale: 1, label: 'Text', onChange: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn() }
    const view = render(<ComicTextEditor {...props} />); const editor = screen.getByRole('textbox')
    expect(editor.style.fontSize).toBe('36px')
    view.rerender(<ComicTextEditor {...props} region={{ ...region, targetText: 'changed' }} />)
    expect(editor.style.fontSize).toBe('36px')
    view.rerender(<ComicTextEditor {...props} region={{ ...region, style: { ...region.style, fontSize: 48 } }} />)
    expect(editor.style.fontSize).toBe('48px')
    view.rerender(<ComicTextEditor {...props} region={{ ...region, style: { ...region.style, autoFontSize: false } }} />)
    expect(editor.style.fontSize).toBe('24px')
  })
  it('uses the resolved font and scales run sizes with the fitted base size', () => {
    const resolvedLayout = { text: 'a😀文', x: 10, y: 20, width: 200, height: 100, fontSize: 12, lineHeight: 16, lines: ['a😀文'], direction: 'horizontal' as const, angle: 0, fontFamily: 'ResolvedFont', fontWeight: 700, fontStyle: 'italic' as const }
    render(<ComicTextEditor region={{ ...region, resolvedLayout }} runs={[{ start: 0, end: 1, style: { fontSize: 40 } }]} scale={1} label="Text" onChange={vi.fn()} onCommit={vi.fn()} onCancel={vi.fn()} />)
    const editor = screen.getByRole('textbox'); expect(editor.style.fontFamily).toBe('ResolvedFont'); expect(editor.style.fontWeight).toBe('700')
    expect(editor.querySelector('span')!.style.fontSize).toBe('20px')
    expect(editor.querySelector('span')!.style.fontFamily).toBe('')
  })
  it('freezes the fitted base before applying an explicit character size and undoes the freeze', () => {
    const layout = { text: 'a😀文', x: 10, y: 20, width: 200, height: 100, fontSize: 27, lineHeight: 33, lines: ['a😀文'], direction: 'horizontal' as const, angle: 0 }
    const fitted = { ...region, style: { ...region.style, fontSize: 48, autoFontSize: true }, resolvedLayout: layout }
    const runs = [{ start: 0, end: 1, style: { fontSize: 80 } }], onChange = vi.fn(), ref = createRef<ComicTextEditorHandle>()
    render(<ComicTextEditor ref={ref} region={fitted} runs={runs} scale={1} label="Text" onChange={onChange} onCommit={vi.fn()} onCancel={vi.fn()} />)
    const editor = screen.getByRole('textbox'), nodes = editor.querySelectorAll('span'), target = nodes[1].firstChild!
    expect(nodes[0].style.fontSize).toBe('45px')
    const range = document.createRange(); range.setStart(target, 0); range.setEnd(target, 2)
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); fireEvent.pointerUp(editor)
    act(() => ref.current!.applyStyle({ fontSize: 64 }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ baseStyle: expect.objectContaining({ fontSize: 27, autoFontSize: false }), runs: [
      { start: 0, end: 1, style: { fontSize: 45 } }, { start: 1, end: 2, style: { fontSize: 64 } },
    ] }))
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ baseStyle: fitted.style, runs }))
  })
  it('uses a newer fitted size after text grows, then freezes that size for an explicit character size', () => {
    const first = { text: 'a😀文', x: 10, y: 20, width: 200, height: 100, fontSize: 40, lineHeight: 48, lines: ['a😀文'], direction: 'horizontal' as const, angle: 0 }
    const fitted = { ...region, style: { ...region.style, fontSize: 48, autoFontSize: true }, resolvedLayout: first }
    const onChange = vi.fn(), ref = createRef<ComicTextEditorHandle>(), props = { ref, region: fitted, scale: 1, label: 'Text', onChange, onCommit: vi.fn(), onCancel: vi.fn() }
    const view = render(<ComicTextEditor {...props} />), editor = screen.getByRole('textbox')
    expect(editor.style.fontSize).toBe('40px')
    editor.textContent = 'a😀文长'; fireEvent.input(editor)
    const newer = { ...first, text: 'a😀文长', fontSize: 20, lineHeight: 24, lines: ['a😀', '文长'] }
    view.rerender(<ComicTextEditor {...props} region={{ ...fitted, targetText: 'a😀文长' }} liveLayout={newer} />)
    expect(editor.style.fontSize).toBe('20px')
    const node = editor.querySelector('span')!.firstChild!, range = document.createRange(); range.setStart(node, 1); range.setEnd(node, 3)
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); fireEvent.pointerUp(editor)
    act(() => ref.current!.applyStyle({ fontSize: 64 }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ baseStyle: expect.objectContaining({ fontSize: 20, autoFontSize: false }), runs: [expect.objectContaining({ start: 1, end: 2, style: { fontSize: 64 } })] }))
  })
  it('undoes and redoes text and character formatting together inside the session', () => {
    const onChange = vi.fn(), ref = createRef<ComicTextEditorHandle>()
    render(<ComicTextEditor ref={ref} region={region} scale={1} label="Text" onChange={onChange} onCommit={vi.fn()} onCancel={vi.fn()} />)
    const editor = screen.getByRole('textbox'); editor.textContent = 'abc'; fireEvent.input(editor)
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true }); expect(onChange).toHaveBeenLastCalledWith({ text: 'a😀文', runs: [], baseStyle: region.style })
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true, shiftKey: true }); expect(onChange).toHaveBeenLastCalledWith({ text: 'abc', runs: [], baseStyle: region.style })
  })
  it('maps an initial canvas click to the browser caret position', () => {
    const original = document.caretRangeFromPoint
    document.caretRangeFromPoint = vi.fn(() => {
      const range = document.createRange(), node = screen.getByRole('textbox').querySelector('span')!.firstChild!
      range.setStart(node, 3); range.collapse(true); return range
    })
    const onSelectionChange = vi.fn()
    try {
      render(<ComicTextEditor region={region} scale={1} caretPoint={{ x: 10, y: 20 }} label="Text" onChange={vi.fn()} onCommit={vi.fn()} onCancel={vi.fn()} onSelectionChange={onSelectionChange} />)
      expect(onSelectionChange).toHaveBeenCalledWith({ start: 2, end: 2 })
    } finally { document.caretRangeFromPoint = original }
  })
  it('routes Ctrl+S to the workspace but keeps composing keystrokes in the editor', () => {
    const save = vi.fn(); window.addEventListener('keydown', save)
    try {
      render(<ComicTextEditor region={region} scale={1} label="Text" onChange={vi.fn()} onCommit={vi.fn()} onCancel={vi.fn()} />)
      const editor = screen.getByRole('textbox')
      fireEvent.keyDown(editor, { key: 's', ctrlKey: true }); expect(save).toHaveBeenCalledTimes(1)
      fireEvent.compositionStart(editor); fireEvent.keyDown(editor, { key: 's', ctrlKey: true, isComposing: true }); expect(save).toHaveBeenCalledTimes(1)
    } finally { window.removeEventListener('keydown', save) }
  })
})
