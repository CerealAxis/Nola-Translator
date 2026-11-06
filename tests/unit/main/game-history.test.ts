import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { GameTranslation } from '../../../src/main/game-translation'
import { MeetingStore } from '../../../src/main/meeting-store'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import { gameProfileSchema } from '../../../src/shared/game-translation'
import { screenConfigSchema, screenTranslationModel } from '../../../src/shared/screen-translation'
import type { ScreenTranslation } from '../../../src/main/screen-translation'

vi.mock('electron', () => ({ clipboard: { readText: () => 'Game dialogue' }, dialog: {} }))
vi.mock('../../../src/main/game-overlay', () => ({ GameSubtitleWindow: class {
  update() {} close() {} begin() {} clearCurrent() {}
} }))

it('reopens a completed game transcript through the records store after restarting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nola-game-history-'))
  const recordsRoot = join(root, 'records'), configPath = join(root, 'game.json')
  const profile = gameProfileSchema.parse({ id: crypto.randomUUID(), name: 'My game', source: 'clipboard' })
  const model = screenTranslationModel(screenConfigSchema.parse({}), DEFAULT_SETTINGS)
  const records = new MeetingStore(recordsRoot)
  let service: GameTranslation | undefined
  try {
    await records.initialize(join(root, 'history.jsonl'))
    await writeFile(configPath, JSON.stringify({ version: 1, revision: 0, profiles: [profile] }))
    service = new GameTranslation({ mainDir: root, configPath, records, settings: () => DEFAULT_SETTINGS,
      screen: { subscribe: () => () => {}, stop: async () => {} } as unknown as ScreenTranslation,
      gatewaySnapshot: () => ({ state: 'running', availableModels: { mt: [{ binding: model, name: model, kind: 'mt', origin: 'cloud', free: true }] } }),
      inferModel: async () => ({ text: '游戏对白' }), publish: () => {} })
    await service.command({ action: 'connect', id: profile.id })
    await vi.waitFor(async () => expect((await service!.snapshot()).lines[0]?.status).toBe('ready'))
    await service.dispose(); service = undefined
    const reopened = new MeetingStore(recordsRoot)
    await reopened.initialize(join(root, 'history.jsonl'))
    expect(reopened.list()).toMatchObject([{ sourceKind: 'game', gameId: profile.id, title: profile.name, segmentCount: 1, state: 'completed' }])
    expect(await reopened.segments(reopened.list()[0].meetingId)).toMatchObject([{ sourceText: 'Game dialogue', translations: [{ text: '游戏对白' }] }])
  } finally {
    await service?.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
