import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TtsVoiceSelector } from '../../src/renderer/components/tts/TtsVoiceSelector'
import { ttsCatalogCapabilities } from '../../src/shared/tts/catalog'
import type { VoiceLibraryApi } from '../../src/shared/tts/voice-library-api'
import { notifyError } from '@/components/primitives/notify'
import { TtsCompatibilityError } from '../../src/shared/tts/errors'
import { resolveTtsRequest } from '../../src/main/tts/tts-request-resolver'

const { api, navigation } = vi.hoisted(() => ({ api: { current: null as Partial<VoiceLibraryApi> | null }, navigation: { open: undefined as undefined | ((page: string) => Promise<void>) } }))
vi.mock('@/store', () => ({ getBridge: () => ({ voices: api.current, app: { openMainPage: navigation.open } }) }))
vi.mock('@/i18n', () => ({ useI18n: () => ({ language: 'zh-CN' }) }))
vi.mock('@/components/primitives/notify', () => ({ notifyError: vi.fn() }))
const profile = { schemaVersion: 1 as const, id: 'saved', revision: 1, name: 'Narrator', kind: 'design' as const,
  representations: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView = vi.fn()
  api.current = { list: async () => [], capabilities: async binding => ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', binding),
    compatibility: async (binding, targetLanguage, refs) => Promise.all(refs.map(async ref => {
      try {
        await resolveTtsRequest({ schemaVersion: 1, requestId: crypto.randomUUID(), modelBinding: binding, voiceRef: ref, text: 'Hello', targetLanguage }, {
          capabilities: value => api.current!.capabilities!(value), profile: async () => undefined, asset: async () => { throw new Error('missing') }, bindings: async () => [], scopeId: 'local',
        })
        return { ref, compatible: true }
      } catch (error) { return { ref, compatible: false, code: error instanceof TtsCompatibilityError ? error.code : undefined, details: error instanceof TtsCompatibilityError ? error.details : undefined } }
    })) }
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); navigation.open = undefined })

it('lists all nine MiMo presets and emits the selected preset without changing it implicitly', async () => {
  const onChange = vi.fn(), user = userEvent.setup()
  render(<TtsVoiceSelector modelBinding="cloud:mimo" targetLanguage="zh" value={{ kind: 'engine-default' }} onChange={onChange} />)
  await user.click(screen.getByRole('combobox', { name: '音色' }))
  for (const name of ['mimo_default', '冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'])
    expect(await screen.findByRole('option', { name: new RegExp(name) })).toBeVisible()
  await user.click(screen.getByRole('option', { name: /茉莉/ }))
  expect(onChange).toHaveBeenCalledWith({ kind: 'preset', modelBinding: 'cloud:mimo', voiceId: '茉莉' })
})

it('keeps a deleted reference visible without clearing the parent selection', async () => {
  const onChange = vi.fn()
  api.current!.list = async () => [{ ...profile, deletedAt: profile.updatedAt }]
  render(<TtsVoiceSelector modelBinding="cloud:preset" targetLanguage="en" value={{ kind: 'profile', profileId: profile.id }} onChange={onChange} />)
  expect(await screen.findByRole('combobox', { name: '音色' })).toBeVisible()
  expect(onChange).not.toHaveBeenCalled()
})

it('replaces inventory when the model changes and excludes incompatible references', async () => {
  api.current!.capabilities = async binding => ({ ...ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', binding), presetVoices: [{ id: binding, name: binding, languages: ['en'] }] })
  const props = { targetLanguage: 'en', value: { kind: 'engine-default' as const }, onChange: vi.fn() }
  const view = render(<TtsVoiceSelector {...props} modelBinding="first" />), user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '音色' }))
  expect(await screen.findByRole('option', { name: /first/ })).toBeVisible()
  await user.keyboard('{Escape}')
  view.rerender(<TtsVoiceSelector {...props} modelBinding="second" />)
  await user.click(screen.getByRole('combobox', { name: '音色' }))
  expect(await screen.findByRole('option', { name: /second/ })).toBeVisible()
  expect(screen.queryByRole('option', { name: /first/ })).not.toBeInTheDocument()
})

it('rechecks binding availability when the picker is reopened with unchanged profile IDs', async () => {
  let ready = false
  api.current!.list = async () => [{ ...profile, kind: 'imported' }]
  api.current!.compatibility = async (_binding, _language, refs) => refs.map(ref => ({ ref, compatible: ref.kind !== 'profile' || ready }))
  render(<TtsVoiceSelector modelBinding="cloud:preset" targetLanguage="en" value={{ kind: 'engine-default' }} onChange={vi.fn()} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '音色' }))
  expect(await screen.findByRole('option', { name: /Narrator/ })).toHaveAttribute('aria-disabled', 'true')
  await user.keyboard('{Escape}')
  ready = true
  await user.click(screen.getByRole('combobox', { name: '音色' }))
  await waitFor(() => expect(screen.getByRole('option', { name: /Narrator/ })).not.toHaveAttribute('aria-disabled', 'true'))
})


it('keeps English-only voices disabled for Chinese and explains the target language', async () => {
  api.current!.capabilities = async binding => ({ ...ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', binding),
    presetVoices: [{ id: 'english', name: 'English voice', languages: ['en'] }] })
  const onChange = vi.fn(), user = userEvent.setup()
  const view = render(<TtsVoiceSelector modelBinding="cloud:mimo" targetLanguage="zh" value={{ kind: 'engine-default' }} onChange={onChange} />)
  await user.click(screen.getByRole('combobox', { name: '音色' }))
  const item = await screen.findByRole('option', { name: /English voice/ })
  await waitFor(() => expect(item).toHaveTextContent('不可用'))
  expect(item).toHaveAttribute('aria-disabled', 'true')
  expect(item).toHaveAttribute('aria-description', '音色不支持 中文')
  await user.hover(item)
  expect(await screen.findByRole('tooltip')).toHaveTextContent('音色不支持 中文')
  await user.click(item)
  expect(onChange).not.toHaveBeenCalled()
  await user.keyboard('{Escape}')
  view.rerender(<TtsVoiceSelector modelBinding="cloud:mimo" targetLanguage="en" value={{ kind: 'engine-default' }} onChange={onChange} />)
  await user.click(screen.getByRole('combobox', { name: '音色' }))
  await waitFor(() => expect(screen.getByRole('option', { name: /English voice/ })).toHaveTextContent('可用'))
  expect(screen.getByRole('option', { name: /English voice/ })).not.toHaveAttribute('aria-disabled', 'true')
})

it('checks both meeting output languages through the realtime resolver', async () => {
  const check = vi.fn(async (_binding: string, language: string, refs: Parameters<VoiceLibraryApi['compatibility']>[2]) => refs.map(ref => ({ ref,
    compatible: language === 'en', code: language === 'en' ? undefined : 'VOICE_LANGUAGE_UNSUPPORTED', details: { targetLanguage: language } })))
  api.current!.compatibility = check
  render(<TtsVoiceSelector modelBinding="cloud:mimo" targetLanguage="en" targetLanguages={['en', 'zh', 'en']} usage="realtime"
    value={{ kind: 'engine-default' }} onChange={vi.fn()} />)
  await userEvent.setup().click(screen.getByRole('combobox', { name: '音色' }))
  await waitFor(() => expect(screen.getByRole('option', { name: /茉莉/ })).toHaveAttribute('aria-description', '音色不支持 中文'))
  expect(check).toHaveBeenCalledWith('cloud:mimo', 'zh', expect.any(Array), 'realtime')
  expect(check.mock.calls.every(call => call[1] === 'en' || call[1] === 'zh')).toBe(true)
})

it('shows one Toast for an invalid saved choice without an inline error or clearing it', async () => {
  const onChange = vi.fn()
  const props = { modelBinding: 'cloud:mimo', targetLanguage: 'en', value: { kind: 'profile' as const, profileId: 'deleted' }, onChange }
  const view = render(<TtsVoiceSelector {...props} />)
  await userEvent.setup().click(screen.getByRole('combobox', { name: '音色' }))
  await waitFor(() => expect(notifyError).toHaveBeenCalledWith('音色已删除或缺失'))
  view.rerender(<TtsVoiceSelector {...props} />)
  expect(notifyError).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('当前模型或目标语言不支持此音色')).not.toBeInTheDocument()
  expect(onChange).not.toHaveBeenCalled()
})

it('keeps a legacy selection in a profile-only field disabled even when it resolves', async () => {
  api.current!.compatibility = async (_binding, _language, refs) => refs.map(ref => ({ ref, compatible: true }))
  const onChange = vi.fn(), user = userEvent.setup()
  render(<TtsVoiceSelector profilesOnly modelBinding="cloud:mimo" targetLanguage="en" value={{ kind: 'preset', modelBinding: 'cloud:mimo', voiceId: 'legacy' }} onChange={onChange} />)
  await user.click(screen.getByRole('combobox', { name: '音色' }))
  const legacy = await screen.findByRole('option', { name: /legacy/ })
  await waitFor(() => expect(legacy).toHaveAttribute('aria-disabled', 'true'))
  await user.click(legacy)
  expect(onChange).not.toHaveBeenCalled()
})

it('does not requery on close or repeat a failed-check Toast before recovery', async () => {
  const compatibility = vi.fn().mockRejectedValue(new Error('offline'))
  api.current!.compatibility = compatibility
  const user = userEvent.setup()
  render(<TtsVoiceSelector modelBinding="cloud:mimo" targetLanguage="en" value={{ kind: 'engine-default' }} onChange={vi.fn()} />)
  await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1))
  await user.click(screen.getByRole('combobox', { name: '音色' }))
  await waitFor(() => expect(compatibility.mock.calls.length).toBeGreaterThan(1))
  const calls = compatibility.mock.calls.length
  await user.keyboard('{Escape}')
  expect(compatibility).toHaveBeenCalledTimes(calls)
  expect(notifyError).toHaveBeenCalledTimes(1)
})

it('ignores late results after the target language changes', async () => {
  let finish!: (value: Awaited<ReturnType<VoiceLibraryApi['compatibility']>>) => void
  api.current!.compatibility = vi.fn(async (_binding: string, language: string, refs: Parameters<VoiceLibraryApi['compatibility']>[2]) => language === 'zh'
    ? new Promise<Awaited<ReturnType<VoiceLibraryApi['compatibility']>>>(resolve => { finish = resolve }) : refs.map(ref => ({ ref, compatible: true })))
  const props = { modelBinding: 'cloud:mimo', value: { kind: 'engine-default' as const }, onChange: vi.fn() }
  const view = render(<TtsVoiceSelector {...props} targetLanguage="zh" />)
  await waitFor(() => expect(finish).toBeTypeOf('function'))
  view.rerender(<TtsVoiceSelector {...props} targetLanguage="en" />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '音色' }))
  await waitFor(() => expect(screen.getByRole('option', { name: /茉莉/ })).not.toHaveAttribute('aria-disabled', 'true'))
  finish([{ ref: { kind: 'preset', modelBinding: 'cloud:mimo', voiceId: '茉莉' }, compatible: false, code: 'VOICE_LANGUAGE_UNSUPPORTED' }])
  await waitFor(() => expect(screen.getByRole('option', { name: /茉莉/ })).not.toHaveAttribute('aria-disabled', 'true'))
})


it('uses the real MiMo catalog to disable all four English voices for a Chinese translation session', async () => {
  const onChange = vi.fn(), user = userEvent.setup()
  const props = { modelBinding: 'cloud:mimo', value: { kind: 'engine-default' as const }, onChange }
  const view = render(<TtsVoiceSelector {...props} targetLanguage="zh" />)
  await user.click(screen.getByRole('combobox', { name: '音色' }))
  for (const name of ['Mia', 'Chloe', 'Milo', 'Dean']) {
    const option = await screen.findByRole('option', { name: new RegExp(name) })
    await waitFor(() => expect(option).toHaveTextContent('不可用'))
    expect(option).toHaveAttribute('aria-disabled', 'true')
    expect(option).toHaveAttribute('aria-description', '音色不支持 中文')
    await user.click(option)
  }
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.getByRole('option', { name: /冰糖/ })).not.toHaveAttribute('aria-disabled', 'true')
  await user.keyboard('{Escape}')
  view.rerender(<TtsVoiceSelector {...props} targetLanguage="en" />)
  await user.click(screen.getByRole('combobox', { name: '音色' }))
  await waitFor(() => expect(screen.getByRole('option', { name: /Mia/ })).not.toHaveAttribute('aria-disabled', 'true'))
  expect(screen.getByRole('option', { name: /冰糖/ })).toHaveAttribute('aria-disabled', 'true')
  await user.click(screen.getByRole('option', { name: /Mia/ }))
  expect(onChange).toHaveBeenCalledWith({ kind: 'preset', modelBinding: 'cloud:mimo', voiceId: 'Mia' })
})
