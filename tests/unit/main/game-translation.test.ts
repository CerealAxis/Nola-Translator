import { afterEach, expect, it, vi } from 'vitest'
import { clipboard, dialog } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { GameTranslation } from '../../../src/main/game-translation'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import { gameProfileSchema } from '../../../src/shared/game-translation'
import { screenConfigSchema, screenTranslationModel, type ScreenSnapshot } from '../../../src/shared/screen-translation'
import type { ScreenTranslation } from '../../../src/main/screen-translation'
import type { GameHookEvent } from '../../../src/main/game-hook'
import type { GameSnapshot } from '../../../src/shared/game-translation'
import type { DirectModelRequest } from '../../../src/shared/agent-workspace'
import { emptyGlossary, type GlossaryDocument } from '../../../src/shared/glossary'

vi.mock('electron', () => ({ clipboard: { readText: vi.fn(() => '') }, dialog: { showOpenDialog: vi.fn() } }))
vi.mock('../../../src/main/game-overlay', () => ({ GameSubtitleWindow: class {
  begin = vi.fn(); update = vi.fn(); close = vi.fn(); clearCurrent = vi.fn(); owns = vi.fn(() => false)
} }))
vi.mock('node:fs/promises', () => {
  const methods = { readFile: vi.fn(), writeFile: vi.fn(async () => {}), rename: vi.fn(async () => {}), mkdir: vi.fn(async () => {}) }
  return { ...methods, default: methods }
})
const game = gameProfileSchema.parse({ id: 'e6150071-1c14-4920-9419-79aff63a6472', name: 'Game', executable: 'C:/Games/game.exe', source: 'clipboard' })
const services: GameTranslation[] = []
afterEach(async () => { for (const service of services.splice(0)) await service.dispose(); vi.restoreAllMocks() })

function create() {
  vi.mocked(readFile).mockResolvedValue(JSON.stringify({ version: 1, revision: 0, profiles: [game] }))
  const model = screenTranslationModel(screenConfigSchema.parse({}), DEFAULT_SETTINGS)
  const inferModel = vi.fn(async (_request: DirectModelRequest, _signal: AbortSignal) => ({ text: '译文' }))
  const screen = { subscribe: vi.fn(() => () => {}), stop: vi.fn(async () => {}), sources: vi.fn(async () => []), startForGame: vi.fn(), pause: vi.fn(), resume: vi.fn() }
  const service = new GameTranslation({ mainDir: 'C:/Nola/out/main', configPath: 'C:/Nola/game.json', screen: screen as unknown as ScreenTranslation,
    settings: () => DEFAULT_SETTINGS, gatewaySnapshot: () => ({ state: 'running', availableModels: { mt: [{ binding: model, name: model, kind: 'mt', origin: 'cloud', free: true }] } }),
    inferModel, publish: vi.fn() })
  services.push(service)
  return { service, inferModel, screen }
}

it('validates revisions and prevents renderer changes to native-selected executable paths', async () => {
  const { service } = create()
  await expect(service.command({ action: 'saveProfile', profile: { ...game, executable: 'C:/other.exe' }, expectedRevision: 0 })).rejects.toThrow('invalidExecutable')
  await service.command({ action: 'saveProfile', profile: { ...game, name: 'Renamed' }, expectedRevision: 0 })
  await expect(service.command({ action: 'deleteProfile', id: game.id, expectedRevision: 0 })).rejects.toThrow('revisionConflict')
  expect((await service.snapshot()).profiles[0].name).toBe('Renamed')
})

it('keeps persisted profile data unchanged when writing fails', async () => {
  const { service } = create()
  vi.mocked(writeFile).mockRejectedValueOnce(new Error('diskFull'))
  await expect(service.command({ action: 'saveProfile', profile: { ...game, name: 'Lost' }, expectedRevision: 0 })).rejects.toThrow('diskFull')
  expect((await service.snapshot()).profiles[0].name).toBe('Game')
  expect((await service.snapshot()).revision).toBe(0)
})

it('reads clipboard only after explicit connect and fences a late translation after stop', async () => {
  const { service, inferModel } = create()
  let finish!: (result: { text: string }) => void
  inferModel.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  vi.mocked(clipboard.readText).mockReturnValue('A game line')
  expect(inferModel).not.toHaveBeenCalled()
  await service.command({ action: 'connect', id: game.id })
  await vi.waitFor(() => expect(inferModel).toHaveBeenCalledOnce())
  await service.stop()
  finish({ text: '迟到译文' })
  await Promise.resolve(); await Promise.resolve()
  expect(await service.snapshot()).toMatchObject({ status: 'idle', lines: [] })
})

it('adds only the native picker selection and does not modify the library on cancel', async () => {
  const { service } = create()
  vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: true, filePaths: [] })
  await service.command({ action: 'add' })
  expect((await service.snapshot()).revision).toBe(0)
  vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: false, filePaths: ['C:/Games/new.exe'] })
  await service.command({ action: 'add' })
  expect((await service.snapshot()).profiles[1]).toMatchObject({ executable: 'C:/Games/new.exe', source: 'auto' })
})

it('keeps unselected Hook candidates out of MT and fences selected work on stop', async () => {
  const { service, inferModel } = create()
  await service.snapshot()
  let finish!: (result: { text: string }) => void
  inferModel.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const sessionId = crypto.randomUUID()
  const internal = service as unknown as { state: Omit<GameSnapshot, 'profiles' | 'revision' | 'version'>; hookChanged(event: GameHookEvent): void; flushHook(): void }
  internal.state = { status: 'running', activeGameId: game.id, source: 'hook', lines: [], threads: [], sessionId, hookAvailable: true }
  internal.hookChanged({ type: 'thread', id: 'thread1', name: 'TextOutW', code: 'HW', embed: false })
  internal.hookChanged({ type: 'text', id: 'thread1', text: 'Candidate only' }); internal.flushHook()
  expect(inferModel).not.toHaveBeenCalled()
  await expect(service.command({ action: 'selectThreads', sessionId: crypto.randomUUID(), ids: ['thread1'] })).rejects.toThrow('staleSession')
  await service.command({ action: 'selectThreads', sessionId, ids: ['thread1'] })
  internal.hookChanged({ type: 'text', id: 'thread1', text: 'Selected text' }); internal.flushHook()
  await vi.waitFor(() => expect(inferModel).toHaveBeenCalledOnce())
  expect(inferModel.mock.calls[0]?.[0]).toMatchObject({ text: 'Selected text' })
  await service.stop(); finish({ text: 'Late translation' })
  await Promise.resolve(); await Promise.resolve()
  expect(await service.snapshot()).toMatchObject({ status: 'idle', lines: [] })
})

it('retranslates the current clipboard text only when its matched glossary changes', async () => {
  const { service, inferModel } = create()
  const glossary = emptyGlossary()
  const internal = service as unknown as { options: { glossary(): Promise<GlossaryDocument> } }
  internal.options.glossary = async () => structuredClone(glossary)
  vi.mocked(clipboard.readText).mockReturnValue('Name')
  await service.command({ action: 'connect', id: game.id })
  await vi.waitFor(() => expect(inferModel).toHaveBeenCalledOnce())
  await service.refreshGlossary()
  expect(inferModel).toHaveBeenCalledOnce()
  glossary.revision = 1; glossary.matchingRevision = 1
  glossary.libraries.push({ id: crypto.randomUUID(), name: 'Names', description: '', enabled: true, scope: { mode: 'global' },
    entries: [{ id: crypto.randomUUID(), source: 'Name', target: '名称', targetLanguage: '*', caseSensitive: true, enabled: true }] })
  await service.refreshGlossary()
  await vi.waitFor(() => expect(inferModel).toHaveBeenCalledTimes(2))
  expect(inferModel.mock.calls[1][0].glossary).toMatchObject([{ source: 'Name', target: '名称' }])
})

it('drops buffered Hook text when paused and waits for fresh text after resume', async () => {
  const { service, inferModel } = create()
  await service.snapshot()
  const internal = service as unknown as { state: Omit<GameSnapshot, 'profiles' | 'revision' | 'version'>; hookChanged(event: GameHookEvent): void; flushHook(): void }
  internal.state = { status: 'running', activeGameId: game.id, source: 'hook', lines: [], threads: [], sessionId: crypto.randomUUID(), hookAvailable: true }
  internal.hookChanged({ type: 'thread', id: 'thread1', name: 'TextOutW', code: 'HW', embed: false })
  await service.command({ action: 'selectThreads', sessionId: internal.state.sessionId, ids: ['thread1'] })
  internal.hookChanged({ type: 'text', id: 'thread1', text: 'Before pause' })
  await service.command({ action: 'pause' })
  await service.command({ action: 'resume' })
  internal.flushHook()
  expect(inferModel).not.toHaveBeenCalled()
  expect((await service.snapshot()).lines).toEqual([])
  internal.hookChanged({ type: 'text', id: 'thread1', text: 'After resume' })
  internal.flushHook()
  await vi.waitFor(() => expect(inferModel).toHaveBeenCalledOnce())
  expect(inferModel.mock.calls[0][0].text).toBe('After resume')
})

it.each(['hook', 'ocr'] as const)('keeps the failed %s session associated with its game and completed reading history', async source => {
  const { service } = create()
  await service.snapshot()
  const internal = service as unknown as { state: Omit<GameSnapshot, 'profiles' | 'revision' | 'version'>; hookChanged(event: GameHookEvent): void; screenChanged(snapshot: ScreenSnapshot): void }
  const completed = { id: crypto.randomUUID(), text: 'Before disconnect', translation: '断开前', status: 'ready' as const }
  internal.state = { status: 'running', activeGameId: game.id, source, lines: [completed, { id: crypto.randomUUID(), text: 'Pending', status: 'translating' }], sessionId: crypto.randomUUID(), hookAvailable: true }
  if (source === 'hook') internal.hookChanged({ type: 'disconnected' })
  else internal.screenChanged({ status: 'error', error: 'targetUnavailable', blocks: [] } as unknown as ScreenSnapshot)
  await vi.waitFor(async () => {
    const snapshot = await service.snapshot()
    expect(snapshot).toMatchObject({ status: 'error', activeGameId: game.id, error: 'targetUnavailable', lines: [completed] })
    expect(snapshot.source).toBeUndefined()
    expect(snapshot.sessionId).toBeUndefined()
  })
})

it('restores the selected rule on a new PID and ASLR base without enabling embedding', async () => {
  const { service } = create()
  await service.snapshot()
  const internal = service as unknown as { state: Omit<GameSnapshot, 'profiles' | 'revision' | 'version'>; hookChanged(event: GameHookEvent): void }
  const sessionId = crypto.randomUUID()
  internal.state = { status: 'running', activeGameId: game.id, source: 'hook', lines: [], threads: [], sessionId, hookAvailable: true }
  const data = { type: 'thread' as const, name: 'Dialogue', code: 'HQ4@14:game.exe', embed: true }
  internal.hookChanged({ ...data, id: '42:100000:7ff11234:0' })
  await service.command({ action: 'selectThreads', sessionId, ids: ['42:100000:7ff11234:0'] })
  internal.state.threads = []
  internal.hookChanged({ ...data, id: '99:200000:7ee21235:0' })
  internal.hookChanged({ ...data, id: '99:300000:7ee21234:0' })
  expect(internal.state.threads.map(thread => thread.selected)).toEqual([false, true])
  expect(internal.state.embedThreadId).toBeUndefined()
})

it('holds the backup busy guard during window validation and ignores its completion after disposal', async () => {
  const { service, screen } = create()
  await service.command({ action: 'saveProfile', profile: { ...game, source: 'ocr' }, expectedRevision: 0 })
  let sources!: (items: never[]) => void
  screen.sources.mockImplementationOnce(() => new Promise(resolve => { sources = resolve }))
  const request = service.command({ action: 'connect', id: game.id, sourceId: 'window:7:0' })
  await vi.waitFor(() => expect(service.busy).toBe(true))
  await service.dispose()
  sources([{ id: 'window:7:0', kind: 'window' }] as never[])
  await request
  expect(service.busy).toBe(false)
  expect(screen.startForGame).not.toHaveBeenCalled()
})

it.each(['glossary refresh', 'deselect and reselect', 'thread removal and recreation'] as const)('fences pending embedding and shared inference after %s', async change => {
  const { service, inferModel } = create()
  await service.snapshot()
  const id = '7:abc:0:0', sessionId = crypto.randomUUID(), text = 'Shared dialogue'
  const reply = vi.fn(), enableEmbed = vi.fn()
  const internal = service as unknown as {
    state: Omit<GameSnapshot, 'profiles' | 'revision' | 'version'>
    hook: { reply: typeof reply; enableEmbed: typeof enableEmbed; stop(): Promise<void> }
    hookChanged(event: GameHookEvent): void
    flushHook(): void
    embedTranslation(event: Extract<GameHookEvent, { type: 'embedRequest' }>): Promise<void>
  }
  internal.hook = { reply, enableEmbed, stop: async () => {} }
  internal.state = { status: 'running', activeGameId: game.id, source: 'hook', lines: [], threads: [], sessionId, hookAvailable: true }
  const thread = { type: 'thread' as const, id, name: 'Dialogue', code: 'HQ4@15:game.exe', embed: true }
  internal.hookChanged(thread)
  const enable = (threadId: string) => service.command({ action: 'embedHook', id: threadId, sessionId })
  const embed = (token: string) => internal.embedTranslation({ type: 'embedRequest', token, id, text })
  await enable(id)
  let stale!: (value: { text: string }) => void, current!: (value: { text: string }) => void
  inferModel.mockImplementationOnce(() => new Promise(resolve => { stale = resolve }))
    .mockImplementationOnce(() => new Promise(resolve => { current = resolve }))
  const oldRequest = embed('1')
  await vi.waitFor(() => expect(inferModel).toHaveBeenCalledTimes(1))
  if (change === 'glossary refresh') await service.refreshGlossary()
  else {
    if (change === 'deselect and reselect') await enable('')
    else { internal.hookChanged({ type: 'remove', id }); internal.hookChanged(thread) }
    await enable(id)
  }
  const newRequest = embed('2')
  await vi.waitFor(() => expect(inferModel).toHaveBeenCalledTimes(2))
  stale({ text: 'Stale' }); await oldRequest
  expect(reply).not.toHaveBeenCalled()
  internal.state.threads![0].selected = true
  internal.hookChanged({ type: 'text', id, text }); internal.flushHook()
  current({ text: 'Current' }); await newRequest
  await vi.waitFor(() => expect(internal.state.lines.at(-1)).toMatchObject({ translation: 'Current' }))
  await embed('3')
  expect(inferModel).toHaveBeenCalledTimes(2)
  expect(reply.mock.calls).toEqual([['2', 'Current'], ['3', 'Current']])
})
