import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { render, screen, waitFor } from '@testing-library/react'
import { NotesPanel, notesExtensions } from './NotesPanel'

const editors: Editor[] = []
function createEditor(content = '') {
  const editor = new Editor({ extensions: notesExtensions(), content, contentType: 'markdown' })
  editors.push(editor)
  return editor
}
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()) })

/** Exercise the same text-input pipeline used by ProseMirror's browser view. */
function type(editor: Editor, text: string) {
  for (const character of text) {
    const { from, to } = editor.state.selection
    const handled = editor.view.someProp('handleTextInput', handler => handler(
      editor.view, from, to, character, () => editor.state.tr.insertText(character, from, to),
    ))
    if (!handled) editor.commands.insertContent(character)
  }
}

describe('live Markdown notes', () => {
  it.each([1, 2, 3, 4, 5, 6])('turns %i hash markers and a space into an editable heading', level => {
    const editor = createEditor()
    type(editor, `${'#'.repeat(level)} 标题`)
    expect(editor.getHTML()).toContain(`<h${level}>标题</h${level}>`)
    expect(editor.getMarkdown().trim()).toBe(`${'#'.repeat(level)} 标题`)
  })

  it.each([
    ['- ', 'bulletList'], ['1. ', 'orderedList'], ['> ', 'blockquote'], ['``` ', 'codeBlock'],
  ])('converts the block prefix %s while typing', (prefix, node) => {
    const editor = createEditor()
    type(editor, prefix)
    expect(editor.isActive(node)).toBe(true)
  })

  it.each([
    ['**加粗**', 'bold'], ['*斜体*', 'italic'], ['~~删除~~', 'strike'], ['`代码`', 'code'],
  ])('renders %s while typing and keeps its Markdown on save', (markdown, mark) => {
    const editor = createEditor()
    type(editor, markdown)
    expect(editor.getJSON().content?.[0].content?.[0].marks).toContainEqual({ type: mark })
    expect(createEditor(editor.getMarkdown()).getJSON()).toEqual(editor.getJSON())
  })

  it('undoes an automatic heading conversion', () => {
    const editor = createEditor()
    type(editor, '# ')
    expect(editor.isActive('heading')).toBe(true)
    editor.commands.undo()
    expect(editor.isActive('paragraph')).toBe(true)
    editor.commands.redo()
    expect(editor.isActive('heading')).toBe(true)
  })

  it('preserves tables, checked tasks, links and images across a Markdown round trip', () => {
    const markdown = '- [x] 已完成\n- [ ] 待处理\n\n| 名称 | 值 |\n| --- | --- |\n| 内容 | 1 |\n\n[链接](https://example.com)\n\n![图片](https://example.com/image.png)'
    const editor = createEditor(markdown)
    expect(editor.getHTML()).toContain('data-type="taskList"')
    expect(editor.getHTML()).toContain('<table')
    expect(editor.getHTML()).toContain('href="https://example.com"')
    expect(editor.getHTML()).toContain('src="https://example.com/image.png"')
    expect(createEditor(editor.getMarkdown()).getJSON()).toEqual(editor.getJSON())
  })

  it('stores real underline rather than the Markdown bold delimiter', () => {
    const editor = createEditor('下划线')
    editor.commands.selectAll()
    editor.commands.toggleUnderline()
    expect(editor.getMarkdown()).toContain('<u>下划线</u>')
    expect(createEditor(editor.getMarkdown()).getHTML()).toContain('<u>下划线</u>')
  })

  it('renders existing notes directly and replaces them when the external value changes', async () => {
    const view = render(<NotesPanel value="# 已保存标题" onChange={() => undefined} />)
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveTextContent('已保存标题'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('已保存标题')
    expect(screen.queryByRole('button', { name: '预览' })).toBeNull()
    view.rerender(<NotesPanel value="## 另一场会议" onChange={() => undefined} />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('另一场会议'))
  })
})
