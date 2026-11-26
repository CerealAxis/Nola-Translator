import { EditorView } from '@codemirror/view'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import { emptyGlossary } from '../../../../shared/glossary'
import { emptyWordRules } from '../../../../shared/word-rules'
import { parseRoute, useRoute } from '@/routes'
import { TextProcessingSceneField } from './TextProcessingSceneField'
import { TextProcessingTab } from './TextProcessingTab'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  history.replaceState(null, '', '#/')
})

const base = '#/settings/text-processing'
const route = parseRoute(base)
const normalizeLabel = 'Unicode 规范化'

function RoutedTextProcessing() {
  const current = useRoute()
  return <TextProcessingTab key={current.path} route={current} />
}

it('persists the preprocessing switches and drag-handle order across visits', () => {
  const first = render(<TextProcessingTab route={route} />)
  expect(screen.getAllByRole('switch')).toHaveLength(18)
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.getByRole('switch', { name: normalizeLabel }).closest('.settings-row')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('switch', { name: normalizeLabel }))
  fireEvent.keyDown(screen.getByRole('button', { name: new RegExp('拖动.*' + normalizeLabel) }), { key: 'ArrowDown' })
  first.unmount()

  render(<TextProcessingTab route={route} />)
  expect(screen.getAllByRole('switch')[0]).toHaveAccessibleName('过滤控制字符')
  expect(screen.getByRole('switch', { name: normalizeLabel })).toBeChecked()
})

it('opens simple preprocessing options in a dialog and updates the live sandbox preview', async () => {
  render(<TextProcessingTab route={route} />)
  fireEvent.click(screen.getByRole('switch', { name: normalizeLabel }))
  fireEvent.click(screen.getByRole('button', { name: '配置 ' + normalizeLabel }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

  fireEvent.change(screen.getByRole('textbox', { name: '测试原文' }), { target: { value: 'ＡＢＣ' } })
  expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveValue('ABC')
})

it('uses the same settings rows for translation optimization and library links', () => {
  render(<TextProcessingTab route={parseRoute(base + '/optimization')} />)
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  const row = screen.getByRole('switch', { name: '术语表' }).closest('.settings-row')
  expect(row).toContainElement(screen.getByRole('link', { name: '配置 术语表' }))
})

it('keeps word-rule switches available while the glossary switch is saving', async () => {
  let finish!: (value: ReturnType<typeof emptyGlossary>) => void
  const glossary = emptyGlossary()
  vi.spyOn(store, 'getBridge').mockReturnValue({
    glossary: { snapshot: async () => glossary, onChanged: () => () => {},
      command: () => new Promise(resolve => { finish = resolve }) },
    wordRules: { snapshot: async () => emptyWordRules(), onChanged: () => () => {} },
  } as unknown as NolaBridge)
  render(<TextProcessingTab route={parseRoute(base + '/optimization')} />)
  const toggle = await screen.findByRole('switch', { name: '术语表' })
  await waitFor(() => expect(toggle).not.toHaveAttribute('aria-disabled', 'true'))
  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-disabled', 'true')
  const switches = screen.getAllByRole('switch')
  const wordSwitches = switches.filter(item => item !== toggle && item.closest('.settings-row')?.querySelector('a[href*="words"]'))
  expect(wordSwitches).toHaveLength(2)
  wordSwitches.forEach(item => expect(item).not.toHaveAttribute('aria-disabled', 'true'))
  await act(async () => finish({ ...glossary, revision: 1, enabled: false }))
  expect(toggle).not.toHaveAttribute('aria-disabled', 'true')
})

it('opens a named table in the content area and edits rules inline in the table', async () => {
  history.replaceState(null, '', base)
  render(<RoutedTextProcessing />)
  fireEvent.click(screen.getByRole('link', { name: '配置 字符串替换' }))
  fireEvent.click(await screen.findByRole('button', { name: '新建规则表' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: '规则表名称' }), { target: { value: '游戏文本' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(await screen.findByRole('heading', { name: '游戏文本' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '添加规则' }))
  const table = screen.getByRole('table', { name: '游戏文本' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.change(within(table).getByRole('textbox', { name: '查找文本' }), { target: { value: '/\\bNola\\b/i' } })
  expect(within(table).getByRole('textbox', { name: '查找文本' })).toHaveValue('/\\bNola\\b/i')
})

it('stores each scene switch separately', () => {
  const first = render(<TextProcessingSceneField scene="game:1" />)
  fireEvent.click(screen.getByRole('switch', { name: '文本处理' }))
  first.unmount()

  const second = render(<TextProcessingSceneField scene="game:2" />)
  expect(screen.getByRole('switch', { name: '文本处理' })).toBeChecked()
  second.unmount()

  render(<TextProcessingSceneField scene="game:1" />)
  expect(screen.getByRole('switch', { name: '文本处理' })).not.toBeChecked()
})

it('reads Luna TSV rows with quoted multiline cells', async () => {
  localStorage.setItem('nola:text-processing-preview:tables:replace', JSON.stringify([{ id: 'default', name: '替换',
    rules: [{ id: 'test', pattern: 'Old', replacement: 'New', regex: false }],
  }]))
  render(<TextProcessingTab route={parseRoute(base + '/config/replace/default')} />)
  expect(screen.getByRole('cell', { name: 'Old' })).toBeInTheDocument()
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: { files: [{ text: async () => 'true\tfalse\ttrue\t"A\nB"\tC\r\n' }] },
  })
  const table = screen.getByRole('table')
  expect(within(table).getByRole('textbox', { name: '查找文本' })).toHaveValue('Old')
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: { files: [{ text: async () => 'true\tfalse\ttrue\t"A\nB"\tC\r\n' }] },
  })
  await waitFor(() => expect(within(table).getAllByRole('textbox', { name: '查找文本' })).toHaveLength(2))
  expect(within(table).getAllByRole('textbox', { name: '查找文本' })[1]).toHaveValue('/\\b(?:A\nB)\\b/i')
})

it.each([
  ['python-pre', 'def POSTSOLVE(text):', 'POSTSOLVE(text)'],
  ['python-optimize', 'def process_after(self, text, context):', 'class Process'],
])('starts with an editable example and validates before saving %s', async (feature, example, missingEntry) => {
  render(<TextProcessingTab route={parseRoute(base + '/config/' + feature)} />)
  const textbox = await screen.findByRole('textbox', { name: 'Python 脚本' }, { timeout: 5000 })
  const editor = EditorView.findFromDOM(textbox.closest<HTMLElement>('.cm-editor')!)!
  const block = textbox.closest('[data-slot="code-block"]')!
  const storageKey = 'nola:text-processing-preview:script:' + feature
  const sample = editor.state.doc.toString()
  const save = screen.getByRole('button', { name: '保存' })
  const replace = (insert: string) => act(() => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert } }))
  expect(screen.getAllByRole('textbox')).toHaveLength(1)
  expect(block.querySelector('[data-slot="code-block-title"]')).toHaveTextContent(/\.py$/)
  expect(sample).toContain(example)
  expect(textbox.querySelector('.text-danger')).toBeInTheDocument()
  expect(localStorage.getItem(storageKey)).toBeNull()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '自动换行' }))
  expect(textbox).toHaveClass('cm-lineWrapping')
  replace(sample + '\n!')
  fireEvent.click(save)
  expect(screen.getByRole('alert')).toHaveTextContent('Python 语法错误')
  expect(localStorage.getItem(storageKey)).toBeNull()

  replace('pass')
  fireEvent.click(save)
  expect(screen.getByRole('alert')).toHaveTextContent(missingEntry)
  expect(localStorage.getItem(storageKey)).toBeNull()

  replace(sample.replace('return text.strip()', 'return 42'))
  fireEvent.click(save)
  expect(screen.getByRole('alert')).toHaveTextContent(feature === 'python-pre' ? 'POSTSOLVE(text)' : 'Process.process_before')
  expect(localStorage.getItem(storageKey)).toBeNull()

  replace(sample)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(save)
  expect(localStorage.getItem(storageKey)).toBe(JSON.stringify(sample))
})
