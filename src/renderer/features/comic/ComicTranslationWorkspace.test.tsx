import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import * as store from '@/store'
import userEvent from '@testing-library/user-event'
import { useAvailableModels } from '@/available-models'
import type { NolaBridge } from '@/bridge'
import { ComicTranslationWorkspace } from './ComicTranslationWorkspace'
import { createComicTestBridge } from './comic-test-fixture'
import { flushComicSaves } from './comic-data'
import * as notices from '@/components/primitives/notify'

vi.mock('@/available-models', () => ({
  useAvailableModels: vi.fn(() => ({
    mt: [],
    llm: [],
    asr: [],
    tts: [],
    ocr: [],
  })),
}))
vi.mock('../settings/word-rules/WordRuleSelectionField', () => ({
  WordRuleSelectionField: () => <div>禁翻词</div>,
}))
afterEach(() => {
  cleanup()
  vi.mocked(useAvailableModels).mockReturnValue({
    mt: [],
    llm: [],
    asr: [],
    tts: [],
    ocr: [],
  })
  vi.restoreAllMocks()
})
function setup(fixture = createComicTestBridge()) {
  vi.spyOn(store, 'getBridge').mockReturnValue({
    comic: fixture.api,
  } as unknown as NolaBridge)
  render(
    <TooltipProvider>
      <ComicTranslationWorkspace
        projectId={fixture.book().id}
        onBook={() => {}}
      />
    </TooltipProvider>,
  )
  return fixture
}
it('defaults text settings to automatic and offers keyboard-accessible perspective editing', async () => {
  const fixture = setup()
  await screen.findByText('图片概览')
  expect(document.getElementById('comic-default-font')).toHaveTextContent(
    '自动',
  )
  expect(document.getElementById('comic-default-align')).toHaveTextContent(
    '自动',
  )
  expect(document.getElementById('comic-block-align')).toHaveTextContent('自动')
  expect(screen.getByLabelText('行距')).toHaveValue(null)
  await userEvent.click(screen.getByRole('button', { name: '进入编辑' }))
  await userEvent.click(screen.getByRole('button', { name: '四角变形' }))
  const corner = screen.getAllByRole('button', { name: '变形控制点 1' })[0]
  fireEvent.keyDown(corner, { key: 'ArrowRight', shiftKey: true })
  await flushComicSaves(fixture.book().id)
  const saved = fixture.book().pages[0].regions[0]
  expect(saved.textQuad?.[0]).toEqual([40, 30])
  expect(saved.sourceQuad?.[0]).toEqual([30, 30])
  expect(saved.manuallyEdited).toBe(true)
  const nextCorner = screen.getAllByRole('button', { name: '变形控制点 1' })[0]
  fireEvent.keyDown(nextCorner, { key: 'ArrowRight', shiftKey: true })
  await flushComicSaves(fixture.book().id)
  expect(fixture.book().pages[0].regions[0].textQuad?.[0]).toEqual([50, 30])
  await userEvent.click(screen.getByRole('tab', { name: '文字样式' }))
  fireEvent.change(screen.getByLabelText('旋转角度'), {
    target: { value: '15' },
  })
  await flushComicSaves(fixture.book().id)
  const rotated = fixture.book().pages[0].regions[0]
  const edge = rotated.textQuad!
  expect(
    (Math.atan2(edge[1][1] - edge[0][1], edge[1][0] - edge[0][0]) * 180) /
      Math.PI,
  ).toBeCloseTo(15)
  expect(rotated.sourceQuad).toEqual(saved.sourceQuad)
})
it('does not mount an image without a source while a page is loading', async () => {
  const fixture = createComicTestBridge()
  vi.mocked(fixture.api.image).mockImplementation(() => new Promise(() => {}))
  setup(fixture)
  await screen.findByText('图片概览')
  expect(document.querySelector('img:not([src]), img[src=""]')).toBeNull()
  expect(
    document.querySelector('.comic-bubble-canvas [aria-busy="true"]'),
  ).toBeInTheDocument()
  expect(
    document.querySelector('.comic-bubble-canvas [data-slot="skeleton"]'),
  ).toBeInTheDocument()
  expect(
    document.querySelector('.comic-workflow__thumbnail [data-slot="skeleton"]'),
  ).toBeInTheDocument()
})

it('shows canvas labels only when comparing the original and translated images', async () => {
  setup()
  await screen.findByRole('heading', { name: '图片概览' })
  expect(
    within(screen.getByRole('region', { name: '译图' })).queryByText('译图'),
  ).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: '原图' }))
  expect(
    within(screen.getByRole('region', { name: '原图' })).queryByText('原图'),
  ).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: '双图对照' }))
  for (const label of ['原图', '译图']) {
    expect(
      within(screen.getByRole('region', { name: label })).getByText(label),
    ).toBeVisible()
  }
})

it('offers only MT for normal translation and only LLMs for LLM translation and proofreading', async () => {
  vi.mocked(useAvailableModels).mockReturnValue({
    mt: [
      {
        binding: 'cloud:google',
        name: 'MT Only',
        kind: 'mt',
        origin: 'cloud',
        free: true,
        images: true,
      },
    ],
    llm: [
      {
        binding: 'custom:text',
        name: 'Text LLM',
        kind: 'llm',
        origin: 'cloud',
        free: true,
        images: false,
      },
    ],
    asr: [],
    tts: [],
    ocr: [],
  })
  const fixture = setup()
  await screen.findByText('图片概览')
  await userEvent.click(screen.getByRole('button', { name: '流程设置' }))
  await userEvent.click(document.getElementById('comic-model-translate')!)
  expect(
    await screen.findByRole('option', { name: /MT Only/ }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('option', { name: /Text LLM/ }),
  ).not.toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  for (const [tab, name, key] of [
    ['vision', 'LLM 翻译', 'visualModel'],
    ['proof', 'AI 校对', 'proofModel'],
  ] as const) {
    await userEvent.click(screen.getByRole('tab', { name }))
    await userEvent.click(document.getElementById(`comic-model-${tab}`)!)
    expect(
      screen.queryByRole('option', { name: /MT Only/ }),
    ).not.toBeInTheDocument()
    await userEvent.click(
      await screen.findByRole('option', { name: /Text LLM/ }),
    )
    await flushComicSaves(fixture.book().id)
    expect(fixture.book().config[key]).toBe('custom:text')
  }
})

it('loads bridge data and persists rendering configuration', async () => {
  const fixture = setup()
  await screen.findByText('图片概览')
  fireEvent.change(screen.getByLabelText('字号'), { target: { value: '42' } })
  await waitFor(() =>
    expect(fixture.book().config.renderSettings.fontSize).toBe(42),
  )
  expect(fixture.book().config.renderSettings.autoSize).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '应用到全部' }))
  await flushComicSaves(fixture.book().id)
  expect(
    fixture.book().pages.every((page) => page.regions[0].style.fontSize === 42),
  ).toBe(true)
  expect(screen.queryByText(/模拟|原型|预览草稿/)).not.toBeInTheDocument()
})
it('edits the selected bubble and confines OCR to that bubble', async () => {
  const fixture = setup()
  await screen.findByText('图片概览')
  fireEvent.click(screen.getByRole('button', { name: '进入编辑' }))
  await screen.findByLabelText('原文 · OCR 结果')
  const target = document.getElementById('comic-target-text')!
  fireEvent.change(target, { target: { value: '下一站，晴天。' } })
  await flushComicSaves(fixture.book().id)
  expect(fixture.book().pages[0].regions[0].targetText).toBe('下一站，晴天。')
  fireEvent.keyDown(target, { key: 'Delete', isComposing: true })
  expect(fixture.book().pages[0].regions).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '重新 OCR' }))
  await waitFor(() =>
    expect(fixture.api.run).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'ocr',
        regionIds: [fixture.book().pages[0].regions[0].id],
      }),
    ),
  )
})

it('uses the same visible bubble order for the canvas, inspector and list', async () => {
  const fixture = createComicTestBridge()
  const page = fixture.book().pages[0]
  const [first] = page.regions
  const makeRegion = (sourceText: string, ignored = false) => ({
    ...first,
    id: crypto.randomUUID(),
    sourceText,
    targetText: null,
    ignored,
  })
  page.regions = [
    makeRegion('1', true),
    first,
    makeRegion('2', true),
    makeRegion('第二段'),
    makeRegion('第三段'),
  ]
  setup(fixture)
  await screen.findByText('图片概览')
  await userEvent.click(screen.getByRole('button', { name: '进入编辑' }))
  expect(screen.getByRole('heading', { name: '气泡 1 / 3' })).toBeVisible()
  expect(screen.getByLabelText('原文 · OCR 结果')).toHaveValue(first.sourceText)
  expect(screen.queryByRole('button', { name: '气泡 4' })).toBeNull()
  const next = screen.getByRole('button', { name: '下一个气泡' })
  await userEvent.click(next)
  expect(screen.getByLabelText('原文 · OCR 结果')).toHaveValue('第二段')
  await userEvent.click(next)
  expect(screen.getByRole('heading', { name: '气泡 3 / 3' })).toBeVisible()
  expect(next).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: '上一个气泡' }))
  await userEvent.click(screen.getByRole('tab', { name: '气泡' }))
  const list = screen.getByRole('list')
  expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  await userEvent.click(within(list).getByRole('button', { name: '气泡 2 ↑' }))
  await flushComicSaves(fixture.book().id)
  expect(
    fixture.book().pages[0].regions.map((region) => region.sourceText),
  ).toEqual(['1', '第二段', '2', first.sourceText, '第三段'])
  expect(screen.getByRole('heading', { name: '气泡 1 / 3' })).toBeVisible()
})

it('keeps user input when saving fails and exposes retry', async () => {
  const notify = vi.spyOn(notices, 'notifyError').mockReturnValue('save-error')
  const fixture = setup()
  await screen.findByText('图片概览')
  fireEvent.click(screen.getByRole('button', { name: '进入编辑' }))
  const target = await screen.findByLabelText('译文')
  vi.mocked(fixture.api.edit).mockRejectedValueOnce(new Error('diskFull'))
  fireEvent.change(target, { target: { value: '保留这个输入' } })
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith(
      '保存失败',
      expect.objectContaining({
        action: expect.objectContaining({ label: '重试' }),
      }),
    ),
  )
  expect(screen.queryByText('保存失败')).not.toBeInTheDocument()
  expect(target).toHaveValue('保留这个输入')
  await act(async () => {
    notify.mock.calls.at(-1)?.[1]?.action?.onPress()
  })
  await waitFor(() =>
    expect(fixture.book().pages[0].regions[0].targetText).toBe('保留这个输入'),
  )
})

it('reports layout warnings only with Toasts', async () => {
  const warning = vi
    .spyOn(notices, 'notifyWarning')
    .mockReturnValue('layout-warning')
  const fixture = createComicTestBridge()
  fixture.book().pages[0].regions[0].qa = ['textOverflow']
  setup(fixture)
  await screen.findByText('图片概览')
  await userEvent.click(screen.getByRole('button', { name: '进入编辑' }))
  await waitFor(() => expect(warning).toHaveBeenCalledOnce())
  expect(
    document.querySelector('.comic-workflow__inspector [role="status"]'),
  ).toBeNull()
})

it('shows the generation placeholder only for the active output page', async () => {
  const loading = vi
    .spyOn(notices, 'notifyLoading')
    .mockReturnValue('comic-task')
  const update = vi.spyOn(notices, 'notifyUpdate').mockReturnValue('comic-task')
  const success = vi
    .spyOn(notices, 'notifySuccess')
    .mockReturnValue('comic-success')
  const fixture = setup()
  await screen.findByText('图片概览')
  await userEvent.click(screen.getByRole('button', { name: '普通翻译' }))
  await waitFor(() =>
    expect(loading).toHaveBeenCalledWith(
      expect.stringContaining('0%'),
      expect.objectContaining({
        action: expect.objectContaining({ label: '任务中心' }),
      }),
    ),
  )
  expect(document.querySelector('.comic-workflow__progress')).toBeNull()
  expect(document.querySelector('[data-slot="image-generation"]')).toBeNull()
  const [job] = await fixture.api.listTasks()
  const [first, second] = fixture.book().pages
  await act(async () => {
    job.status = 'running'
    job.progress = 50
    job.activePageId = first.id
    fixture.changed()
  })
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(
      'comic-task',
      expect.stringContaining('50%'),
      expect.objectContaining({ variant: 'loading' }),
    ),
  )
  await userEvent.click(screen.getByRole('button', { name: '双图对照' }))
  const original = screen.getByRole('region', { name: '原图' })
  const translated = screen.getByRole('region', { name: '译图' })
  expect(
    within(translated).getByRole('status', { name: '处理中' }),
  ).not.toHaveTextContent('处理中')
  expect(original.querySelector('[data-slot="image-generation"]')).toBeNull()
  const activeThumbnail = screen.getByRole('button', { name: '图片 1 · 处理中' })
  expect(activeThumbnail).toBeVisible()
  expect(activeThumbnail.parentElement).not.toHaveTextContent('处理中')
  expect(screen.getByRole('button', { name: '图片 2' })).toBeVisible()
  await act(async () => {
    job.activePageId = second.id
    fixture.changed()
  })
  await waitFor(() =>
    expect(translated.querySelector('[data-slot="image-generation"]')).toBeNull(),
  )
  await userEvent.click(screen.getByRole('button', { name: '图片 2 · 处理中' }))
  expect(
    await within(translated).findByRole('status', { name: '处理中' }),
  ).toBeVisible()
  await act(async () => {
    job.status = 'completed'
    job.progress = 100
    delete job.activePageId
    fixture.changed()
  })
  await waitFor(() =>
    expect(success).toHaveBeenCalledWith(
      expect.stringContaining('处理完成'),
      expect.anything(),
    ),
  )
  expect(document.querySelector('[data-slot="image-generation"]')).toBeNull()
  expect(
    within(
      document.querySelector('.comic-workflow__main') as HTMLElement,
    ).queryByText('处理完成'),
  ).not.toBeInTheDocument()
})

it('reports successful export only with a Toast', async () => {
  const notify = vi.spyOn(notices, 'notifySuccess').mockReturnValue('exported')
  const fixture = setup()
  await screen.findByText('图片概览')
  await userEvent.click(screen.getByRole('button', { name: '导出' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: '导出' }))
  await waitFor(() => expect(fixture.api.exportProject).toHaveBeenCalledOnce())
  await waitFor(() => expect(notify).toHaveBeenCalledWith('导出'))
  expect(within(dialog).queryByText('处理完成')).not.toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: '导出' })).toBeEnabled()
})
