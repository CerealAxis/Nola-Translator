import { fireEvent, render, screen, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { DocumentWorkbench } from './document'
import { browserText } from './i18n'
import { DEFAULT_PREFERENCES } from './preferences'
import { translate } from './provider-client'
import type { OpenDocument } from './document-formats'

vi.mock('./settings-fields', () => ({
  usePreferences: () => [{ ...DEFAULT_PREFERENCES, sourceLanguage: 'en', pageLanguage: 'zh' }, 'en', browserText('en')],
  languageOptions: () => [{ value: 'en', label: 'English' }, { value: 'zh', label: 'Chinese' }, { value: 'ja', label: 'Japanese' }],
}))
vi.mock('./components/ChoiceField', () => ({
  ChoiceField: ({ label, value, options, disabled, onChange }: { label: string; value: string; options: { value: string; label: string }[]; disabled?: boolean; onChange(value: string): void }) =>
    <label>{label}<select aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>,
}))
vi.mock('./providers', () => ({
  DEFAULT_PROVIDERS: [{ id: 'index-translate', name: 'Index-Translate', capabilities: ['mt'] }],
  loadProviders: vi.fn().mockResolvedValue([{ id: 'index-translate', name: 'Index-Translate', capabilities: ['mt'] }]),
  requestProviderAccess: vi.fn().mockResolvedValue(true),
  visibleProviderConnections: (providers: unknown[]) => providers,
}))
vi.mock('./provider-client', () => ({ translate: vi.fn(), translateImage: vi.fn() }))
const exportFile = vi.fn().mockResolvedValue(new Blob(['translation']))
vi.mock('./document-formats', () => ({
  documentFormats: ['txt'],
  openDocument: vi.fn(async (): Promise<OpenDocument> => ({
    format: 'txt', dispose: vi.fn(), export: exportFile,
    sections: [{ name: '', units: [{ id: 1, source: 'Hello world.' }], markup: values => values.get(1) ?? 'Hello world.' }],
  })),
}))
vi.mock('../../src/renderer/components/ui/toast', () => ({ showToast: vi.fn(), ToastProvider: () => null }))

beforeEach(() => {
  vi.mocked(translate).mockReset().mockResolvedValue('你好，世界。')
  exportFile.mockClear()
})

async function openFile() {
  render(<DocumentWorkbench />)
  fireEvent.change(screen.getByLabelText('Choose a document'), { target: { files: [new File(['Hello world.'], 'sample.txt')] } })
  await screen.findByRole('button', { name: 'Translate document' })
}
async function finishTranslation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Translate document' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Export translation' })).toBeEnabled())
}
const sourceSelect = () => screen.getByRole('combobox', { name: 'Source language' })
const targetSelect = () => screen.getByRole('combobox', { name: 'Target language' })

it('keeps both language selectors usable after translation and preserves results when switching is cancelled', async () => {
  const user = userEvent.setup()
  await openFile()
  await finishTranslation(user)
  expect(sourceSelect()).toBeEnabled()
  expect(targetSelect()).toBeEnabled()
  await user.selectOptions(targetSelect(), 'ja')
  const dialog = await screen.findByRole('dialog', { name: 'Change language' })
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(targetSelect()).toHaveValue('zh')
  expect(screen.getByText('你好，世界。')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Export translation' })).toBeEnabled()
})

it('clears results only after confirmation and translates with the newly selected languages', async () => {
  const user = userEvent.setup()
  await openFile()
  await finishTranslation(user)
  await user.selectOptions(sourceSelect(), 'auto')
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Change language' }))
  expect(sourceSelect()).toHaveValue('auto')
  expect(screen.getByRole('button', { name: 'Export translation' })).toBeDisabled()
  expect(screen.queryByText('你好，世界。')).not.toBeInTheDocument()
  await user.selectOptions(targetSelect(), 'ja')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  vi.mocked(translate).mockResolvedValueOnce('こんにちは、世界。')
  await finishTranslation(user)
  expect(translate).toHaveBeenLastCalledWith('Hello world.', 'auto', 'ja', 'document', expect.any(AbortSignal), 'index-translate')
  expect(screen.getByText('こんにちは、世界。')).toBeVisible()
})

it('pauses an active request on language change and ignores its late result', async () => {
  let finish!: (text: string) => void
  vi.mocked(translate).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const user = userEvent.setup()
  await openFile()
  await user.click(screen.getByRole('button', { name: 'Translate document' }))
  await waitFor(() => expect(translate).toHaveBeenCalled())
  const signal = vi.mocked(translate).mock.calls[0][4]!
  expect(sourceSelect()).toBeEnabled()
  expect(targetSelect()).toBeEnabled()
  await user.selectOptions(targetSelect(), 'ja')
  expect(signal.aborted).toBe(true)
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Change language' }))
  await act(async () => finish('Late result in old language'))
  expect(screen.queryByText('Late result in old language')).not.toBeInTheDocument()
  expect(targetSelect()).toHaveValue('ja')
  expect(screen.getByRole('button', { name: 'Translate document' })).toBeEnabled()
})
