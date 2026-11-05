import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { screenConfigSchema, screenProcessingMode, screenTranslationModel, type ScreenFrame } from '../../../src/shared/screen-translation'
import { DEFAULT_SETTINGS, type AppSettings } from '../../../src/shared/settings'
import type { ModelGatewaySnapshot } from '../../../src/shared/model-gateway'
import { readFile as readConfig, writeFile as writeConfig } from 'node:fs/promises'
import { BrowserWindow, globalShortcut } from 'electron'
import { EventEmitter } from 'node:events'
import { FeatureActivity } from '../../../src/main/feature-activity'

const fixture = vi.hoisted(() => ({ sources: vi.fn(async (): Promise<Array<{ id: string; name: string; display_id?: string; thumbnail: { toDataURL(): string } }>> => [{ id: 'screen:1:0', name: 'Display', display_id: '1', thumbnail: { toDataURL: () => '' } }]), handlers: new Map<string, (...args: unknown[]) => unknown>() }))
vi.mock('electron', () => ({
  app: { on: vi.fn(), removeListener: vi.fn() },
  BrowserWindow: Object.assign(vi.fn(), { getAllWindows: () => [] }),
  desktopCapturer: { getSources: fixture.sources },
  globalShortcut: { register: vi.fn(() => true), unregister: vi.fn(), isRegistered: vi.fn(() => false) },
  ipcMain: { handle: (name: string, handler: (...args: unknown[]) => unknown) => fixture.handlers.set(name, handler), removeHandler: (name: string) => fixture.handlers.delete(name) },
  screen: { getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }], getDisplayNearestPoint: () => ({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }), getCursorScreenPoint: () => ({ x: 10, y: 10 }) }, session: {},
}))
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const methods = { readFile: vi.fn(async () => JSON.stringify({ sourceId: 'screen:1:0', sourceName: 'Display', model: 'cloud:google', regions: [{ id: '8ddba01d-f7dd-4ea2-b24e-0a3220212420', x: 0, y: 0, width: 1, height: 1 }] })),
    mkdir: vi.fn(async () => {}), writeFile: vi.fn(async () => {}), rename: vi.fn(async () => {}) }
  return { ...actual, ...methods, default: { ...actual, ...methods } }
})
import { ScreenTranslation } from '../../../src/main/screen-translation'

let services: ScreenTranslation[] = []
beforeEach(() => { fixture.sources.mockClear(); fixture.handlers.clear() })
afterEach(async () => { for (const service of services) await service.dispose(); services = []; vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function create(prepare = async () => {}, _connected = false, settings: AppSettings = DEFAULT_SETTINGS, getMainWindow?: () => BrowserWindow | null) {
  const activity = new FeatureActivity(), publish = vi.fn()
  const gateway: Pick<ModelGatewaySnapshot, 'state' | 'availableModels'> = { state: 'running', availableModels: { mt: [...new Set(['cloud:google', 'cloud:mymemory', 'cloud:microsoft', screenTranslationModel(screenConfigSchema.parse({}), settings)])].map(binding => ({ binding, kind: 'mt', name: binding, origin: 'cloud', free: true })) } }
  const service = new ScreenTranslation({ mainDir: 'D:/Nola/out/main', configPath: 'D:/Nola/screen.json', prepareOcr: async () => { await prepare(); return () => {} },
    gatewaySnapshot: () => gateway,
    getMainWindow,
    inferOcr: async () => { throw new Error('resourceBusy') },
    settings: () => settings, inferModel: vi.fn(async () => ({ text: 'translated' })), publish, activity })
  services.push(service)
  return { service, activity, publish, gateway }
}

it('defaults legacy settings to follow-gateway while preserving explicit processing choices', () => {
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.modelGateway.mtModel = 'cloud:microsoft'
  const config = screenConfigSchema.parse({ model: 'cloud:google' })
  expect(screenProcessingMode(config)).toBe('default')
  expect(screenTranslationModel(config, settings)).toBe('cloud:microsoft')
  config.processingMode = 'cascade'
  expect(screenTranslationModel(config, settings)).toBe('cloud:google')
  config.processingMode = 'default'
  expect(screenTranslationModel(config, settings)).toBe('cloud:microsoft')
  settings.modelGateway.mtModel = 'cloud:mymemory'
  expect(screenTranslationModel(config, settings)).toBe('cloud:mymemory')
  expect(screenProcessingMode(screenConfigSchema.parse({}))).toBe('default')
})

it.each(['start', 'resume'] as const)('refuses S2S inherited from the gateway before %s opens capture or OCR', async action => {
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.realtime = { ...settings.realtime, defaultPipeline: 's2s', s2sModel: 'qwen3.5-livetranslate-flash-realtime' }
  const prepare = vi.fn(async () => {})
  const { service, activity } = create(prepare, false, settings)
  await service.configure(screenConfigSchema.parse({ processingMode: 'default' }))
  await service[action]()
  expect(service.snapshot()).toMatchObject({ status: 'error', error: 's2sUnsupported' })
  expect(prepare).not.toHaveBeenCalled()
  expect(activity.has('screen-translation')).toBe(false)
})

it('discovers only desktop displays without requesting previews', async () => {
  const { service } = create()
  fixture.sources.mockResolvedValueOnce([{ id: 'screen:1:0', name: 'Display', display_id: '1', thumbnail: { toDataURL: () => '' } }])
  expect((await service.sources()).map(source => source.id)).toEqual(['screen:1:0'])
  expect(fixture.sources).toHaveBeenCalledWith({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
})

it('does not apply screenshot protection to unrelated application windows during startup', async () => {
  const protect = vi.fn()
  vi.spyOn(BrowserWindow, 'getAllWindows').mockReturnValue([{ isDestroyed: () => false, isContentProtected: () => false, setContentProtection: protect } as unknown as BrowserWindow])
  let finish!: () => void
  const { service } = create(() => new Promise<void>(resolve => { finish = resolve }))
  const starting = service.start()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  expect(protect).not.toHaveBeenCalled()
  await service.stop(); finish(); await starting
  expect(protect).not.toHaveBeenCalled()
})

it('updates only shortcuts without stopping capture or changing its target and style', async () => {
  const { service } = create()
  await service.configure(screenConfigSchema.parse({ sourceId: 'screen:1', fontSize: 26 }))
  const stop = vi.spyOn(service, 'stop')
  const config = service.snapshot().config
  const internal = service as unknown as { state: { status: string } }
  internal.state.status = 'running'
  await service.configureShortcuts({ toggleShortcut: 'Control+Shift+F7', editShortcut: '', stopShortcut: config.stopShortcut })
  expect(stop).not.toHaveBeenCalled()
  expect(service.snapshot().status).toBe('running')
  expect(service.snapshot().config).toEqual({ ...config, toggleShortcut: 'Control+Shift+F7', editShortcut: '' })
})

it('restores previous shortcuts when the new key cannot be registered', async () => {
  const { service } = create()
  await service.configure(screenConfigSchema.parse({}))
  const previous = service.snapshot().config
  vi.mocked(globalShortcut.register).mockReturnValueOnce(false)
  await service.configureShortcuts({ ...previous, toggleShortcut: 'Control+Shift+F7' })
  expect(service.snapshot().config).toEqual(previous)
  expect(service.snapshot().shortcutError).toBe(true)
  expect(globalShortcut.register).toHaveBeenLastCalledWith(previous.stopShortcut, expect.any(Function))
})

it('suspends shortcuts while recording and restores them if the renderer crashes', async () => {
  const { service } = create()
  await service.configure(screenConfigSchema.parse({}))
  const frame = { url: 'file:///D:/Nola/out/renderer/index.html' }
  const owner = Object.assign(new EventEmitter(), { mainFrame: frame })
  const before = vi.mocked(globalShortcut.register).mock.calls.length
  await fixture.handlers.get('screen:command')!({ sender: owner, senderFrame: frame }, { action: 'shortcutRecording', active: true })
  expect(vi.mocked(globalShortcut.register).mock.calls).toHaveLength(before)
  await expect(service.configureShortcuts({ toggleShortcut: '', editShortcut: '', stopShortcut: '' })).rejects.toThrow('recording')
  owner.emit('render-process-gone')
  expect(vi.mocked(globalShortcut.register).mock.calls).toHaveLength(before + 4)
  expect(owner.listenerCount('destroyed')).toBe(0)
})

it('preserves editor bindings when an older client updates only global shortcuts', async () => {
  const { service } = create()
  await service.configure(screenConfigSchema.parse({ editorShortcuts: { left: 'Alt+J' } }))
  await service.configureShortcuts({ toggleShortcut: 'Control+F7', editShortcut: '', stopShortcut: '' })
  expect(service.snapshot().config.editorShortcuts?.left).toBe('Alt+J')
})

it('fences a start interrupted while the backend is still being prepared', async () => {
  let prepared!: () => void
  const ensure = vi.fn(() => new Promise<void>(resolve => { prepared = resolve }))
  const { service, activity } = create(ensure)
  const starting = service.start()
  await vi.waitFor(() => expect(ensure).toHaveBeenCalledOnce())
  expect(activity.has('screen-translation')).toBe(true)
  await service.stop()
  prepared(); await starting
  expect(service.snapshot().status).toBe('ready')
  expect(activity.has('screen-translation')).toBe(false)
  expect(service.snapshot().status).not.toBe('running')
})

it('manual pause during startup releases its reservation and cannot open a late capture', async () => {
  let prepared!: () => void
  const { service, activity } = create(() => new Promise<void>(resolve => { prepared = resolve }))
  const starting = service.start()
  await vi.waitFor(() => expect(prepared).toBeTypeOf('function'))
  await service.pause(); prepared(); await starting
  expect(service.snapshot().status).toBe('paused')
  expect(activity.has('screen-translation')).toBe(false)
  expect(service.snapshot().status).not.toBe('running')
})

it('releases the feature reservation after a fatal backend startup error and retains a retryable reason', async () => {
  const { service, activity } = create(async () => { throw new Error('Backend exited') })
  await service.start()
  await vi.waitFor(() => expect(activity.has('screen-translation')).toBe(false))
  expect(service.snapshot()).toMatchObject({ status: 'error', error: 'ocrNotReady' })
  expect(activity.has('screen-translation')).toBe(false)
})

it('checks OCR readiness before missing regions or translation configuration', async () => {
  const prepare = vi.fn(async () => { throw new Error('ocrNotReady') })
  const { service, activity } = create(prepare)
  await service.configure(screenConfigSchema.parse({ regions: [], model: '' }))
  fixture.sources.mockClear()
  await service.start()
  expect(prepare).toHaveBeenCalledOnce()
  expect(service.snapshot()).toMatchObject({ status: 'error', error: 'ocrNotReady' })
  expect(fixture.sources).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(activity.has('screen-translation')).toBe(false))
})

it.each(['stopped', 'starting', 'stopping', 'failed'] as const)('reports the %s gateway before checking models or regions', async state => {
  const prepare = vi.fn(async () => { throw new Error('ocrNotReady') })
  const { service, gateway, activity } = create(prepare)
  gateway.state = state
  await service.configure(screenConfigSchema.parse({ regions: [], model: '' }))
  await service.start()
  expect(service.snapshot()).toMatchObject({ status: 'error', error: 'gatewayNotReady', errorId: expect.any(String) })
  expect(prepare).not.toHaveBeenCalled()
  expect(activity.has('screen-translation')).toBe(false)
})

it.each([
  ['', 'translationModelMissing'],
  ['resource:unloaded', 'translationModelNotReady'],
] as const)('reports translation model %s before missing regions', async (model, error) => {
  const { service } = create()
  await service.configure(screenConfigSchema.parse({ processingMode: 'cascade', regions: [], model }))
  await service.start()
  expect(service.snapshot()).toMatchObject({ status: 'error', error })
})

it('reports equal languages separately after models and regions are ready', async () => {
  const { service } = create()
  await (service as unknown as { ready: Promise<void> }).ready
  await service.configure({ ...service.snapshot().config, processingMode: 'cascade', model: 'cloud:google', sourceLanguage: 'zh', targetLanguage: 'zh' })
  await service.start()
  expect(service.snapshot()).toMatchObject({ status: 'error', error: 'sameLanguage' })
})

it('keeps one error identity through cleanup and assigns a new one on retry', async () => {
  const { service, gateway, publish } = create()
  gateway.state = 'stopped'
  await (service as unknown as { ready: Promise<void> }).ready
  publish.mockClear()
  await service.start()
  await vi.waitFor(() => expect(publish.mock.calls.length).toBeGreaterThanOrEqual(2))
  const first = service.snapshot().errorId
  expect(new Set(publish.mock.calls.map(([value]) => value.errorId))).toEqual(new Set([first]))
  await service.start()
  expect(service.snapshot().errorId).not.toBe(first)
})

it('reports missing regions after OCR is ready and releases the OCR lease', async () => {
  const release = vi.fn()
  const { service, activity } = create()
  const options = service as unknown as { options: { prepareOcr: () => Promise<() => void> } }
  options.options.prepareOcr = vi.fn(async () => release)
  await service.configure(screenConfigSchema.parse({ regions: [], model: 'cloud:google' }))
  await service.start()
  expect(service.snapshot()).toMatchObject({ status: 'error', error: 'regionsMissing' })
  await vi.waitFor(() => expect(release).toHaveBeenCalledOnce())
  expect(activity.has('screen-translation')).toBe(false)
})

it('skips transient native OCR busy responses instead of failing the recovered session', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'resourceBusy' }), { status: 409 })))
  const { service } = create(undefined, true)
  await Promise.resolve(); await Promise.resolve()
  const snapshot = service.snapshot(), config = screenConfigSchema.parse(snapshot.config)
  const internal = service as unknown as { state: typeof snapshot; pipeline: { update: () => void; stop: () => void; hideRegion: () => void }; frame(frame: ScreenFrame): Promise<void> }
  internal.state.status = 'running'
  internal.pipeline = { update: vi.fn(), stop: vi.fn(), hideRegion: vi.fn() }
  await internal.frame({ sessionId: snapshot.sessionId, epoch: snapshot.epoch, width: 800, height: 600,
    regions: [{ regionId: config.regions[0].id, image: 'data:image/png;base64,abcd', hash: 'new-frame' }] })
  expect(service.snapshot().status).toBe('running')
  expect(service.snapshot().error).toBeUndefined()
})

it('does not register shortcuts when persisted settings finish loading after disposal', async () => {
  let finish!: (value: string) => void
  ;(readConfig as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve }))
  const { service } = create()
  await service.dispose()
  const before = vi.mocked(globalShortcut.register).mock.calls.length
  finish('{}')
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  expect(vi.mocked(globalShortcut.register).mock.calls).toHaveLength(before)
})

it('does not reopen region editing after the service has been disposed', async () => {
  const { service } = create()
  await service.dispose()
  await service.edit()
  expect(service.snapshot().status).not.toBe('running')
  expect(service.snapshot().status).toBe('ready')
})

function editorFixture(visible = true) {
  const owner = { isVisible: () => visible, isDestroyed: vi.fn(() => false), hide: vi.fn(), show: vi.fn(), focus: vi.fn() }
  const { service } = create(undefined, false, DEFAULT_SETTINGS, () => owner as unknown as BrowserWindow)
  const frame = { url: 'file:///D:/Nola/out/renderer/screen.html' }
  const editor = Object.assign(new EventEmitter(), {
    webContents: { mainFrame: frame, isDestroyed: () => false, isLoadingMainFrame: () => true },
    isDestroyed: () => false, destroy: vi.fn(),
  })
  editor.destroy.mockImplementation(() => { editor.emit('closed') })
  const open = vi.spyOn(service as unknown as { openWindow(): BrowserWindow }, 'openWindow').mockReturnValue(editor as unknown as BrowserWindow)
  return { service, owner, editor, frame, open }
}

it.each(['cancelEdit', 'regions'] as const)('hides the main window for editing and restores it after %s', async action => {
  const { service, owner, editor, frame } = editorFixture()
  await service.edit()
  expect(owner.hide).toHaveBeenCalledOnce()
  expect(owner.show).not.toHaveBeenCalled()
  await fixture.handlers.get('screen:command')!({ sender: editor.webContents, senderFrame: frame }, action === 'regions'
    ? { action, regions: service.snapshot().config.regions } : { action })
  expect(owner.show).toHaveBeenCalledOnce()
  expect(owner.focus).toHaveBeenCalledOnce()
  await service.stop()
  expect(owner.show).toHaveBeenCalledOnce()
})

it('restores the main window if the region editor closes unexpectedly', async () => {
  const { service, owner, editor } = editorFixture()
  await service.edit()
  editor.emit('closed')
  await vi.waitFor(() => expect(owner.show).toHaveBeenCalledOnce())
})

it('does not reopen a main window that was already hidden before editing', async () => {
  const { service, owner } = editorFixture(false)
  await service.edit()
  await service.stop()
  expect(owner.hide).not.toHaveBeenCalled()
  expect(owner.show).not.toHaveBeenCalled()
})

it('does not restore a destroyed main window after editing', async () => {
  const { service, owner } = editorFixture()
  await service.edit()
  owner.isDestroyed.mockReturnValue(true)
  await service.stop()
  expect(owner.show).not.toHaveBeenCalled()
})

it('leaves the main window visible when the editor cannot open', async () => {
  const { service, owner, open } = editorFixture()
  open.mockImplementation(() => { throw new Error('window unavailable') })
  await expect(service.edit()).rejects.toThrow('window unavailable')
  expect(owner.hide).not.toHaveBeenCalled()
})

it('does not expose model management commands through screen translation', async () => {
  const { screenCommandSchema } = await import('../../../src/shared/screen-translation')
  for (const action of ['installOcr', 'deleteOcr', 'cancelOcr', 'ocrStatus']) {
    expect(screenCommandSchema.safeParse({ action }).success).toBe(false)
  }
})

it('releases a late OCR lease when start was stopped during readiness checking', async () => {
  let finish!: () => void
  const release = vi.fn()
  const service = new ScreenTranslation({ mainDir: 'D:/Nola/out/main', configPath: 'D:/Nola/screen.json',
    gatewaySnapshot: () => ({ state: 'running' }),
    prepareOcr: async () => { await new Promise<void>(resolve => { finish = resolve }); return release },
    inferOcr: vi.fn(), settings: () => DEFAULT_SETTINGS, inferModel: vi.fn(), publish: vi.fn() })
  services.push(service)
  const starting = service.start()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  await service.stop(); finish(); await starting
  expect(release).toHaveBeenCalledOnce()
})


it('saves 64 rectangles as a preset and retains language, model and draft when loading it', async () => {
  const { service } = create()
  await (service as unknown as { ready: Promise<void> }).ready
  vi.spyOn(service, 'showRegions').mockResolvedValue()
  const regions = Array.from({ length: 64 }, (_, index) => ({ id: crypto.randomUUID(), x: index % 8 / 8, y: Math.floor(index / 8) / 8, width: .1, height: .1 }))
  await service.configure({ ...service.snapshot().config, regions })
  await service.savePreset('Reading')
  const id = service.snapshot().presets![0].id
  const changed = [{ ...regions[0], x: .5 }]
  await service.configure({ ...service.snapshot().config, regions: changed, targetLanguage: 'ja', model: 'cloud:mymemory' })
  await service.loadPreset(id)
  expect(service.snapshot().config).toMatchObject({ regions, targetLanguage: 'ja', model: 'cloud:mymemory', presetId: id })
  await service.loadPreset('draft')
  expect(service.snapshot().config.regions).toEqual(changed)
  const persisted = JSON.parse(vi.mocked(writeConfig).mock.calls.at(-1)![1] as string)
  expect(persisted.version).toBe(2)
  expect(persisted.presets[0].regions).toHaveLength(64)
  await service.renamePreset(id, 'Work')
  expect(service.snapshot().presets![0].name).toBe('Work')
  await service.deletePreset(id)
  expect(service.snapshot().presets).toEqual([])
  expect(service.snapshot().config.regions).toEqual(changed)
})

it('does not overwrite a preset without an explicit update and rolls back failed persistence', async () => {
  const { service } = create()
  await (service as unknown as { ready: Promise<void> }).ready
  await service.savePreset('Reading')
  const previous = service.snapshot()
  await expect(service.savePreset('Reading')).rejects.toThrow('presetNameExists')
  vi.mocked(writeConfig).mockRejectedValueOnce(new Error('Disk full'))
  await expect(service.renamePreset(previous.presets![0].id, 'Changed')).rejects.toThrow('Disk full')
  expect(service.snapshot().presets).toEqual(previous.presets)
})

it('reads version two presets without changing the current selection', async () => {
  const config = screenConfigSchema.parse({ sourceLanguage: 'en', regions: [{ id: crypto.randomUUID(), x: .1, y: .1, width: .2, height: .2 }] })
  const preset = { id: crypto.randomUUID(), name: 'Game', sourceId: '', sourceName: '', regions: config.regions }
  vi.mocked(readConfig).mockResolvedValueOnce(JSON.stringify({ version: 2, config, presets: [preset] }))
  const { service } = create()
  await (service as unknown as { ready: Promise<void> }).ready
  expect(service.snapshot().presets).toEqual([preset])
  expect(service.snapshot().config).toEqual(config)
})


it('requires confirmation before using rectangles migrated from a legacy window source', async () => {
  vi.mocked(readConfig).mockResolvedValueOnce(JSON.stringify({ sourceId: 'window:99:0', model: 'cloud:google', regions: [{ id: crypto.randomUUID(), x: .1, y: .1, width: .2, height: .2 }] }))
  const { service } = create()
  await (service as unknown as { ready: Promise<void> }).ready
  const edit = vi.spyOn(service, 'edit').mockResolvedValue()
  await service.start()
  expect(edit).toHaveBeenCalledOnce()
  expect(service.snapshot().config.reviewRequired).toBe(true)
  await expect(service.savePreset('Unchecked')).rejects.toThrow('invalidConfig')
})
