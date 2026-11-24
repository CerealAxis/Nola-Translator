import { z } from 'zod'
import type { UiLanguage } from '../../../../shared/languages'
import type { DemoGame } from './DemoGames'
import { defaultHookSettings, hookCodePages, newSession, type DemoSession, type Entry, type HookSettings, type Profile } from './session'

const key = 'nola.game-translation-review.v1'
const text = z.string().max(4096)
const identifier = z.string().min(1).max(512).refine(value => !['__proto__', 'constructor', 'prototype'].includes(value))
const source = z.enum(['hook', 'clipboard', 'ocr'])
const language = z.enum(['ja', 'zh', 'zh-Hant', 'en', 'ko'])
const counter = z.number().int().nonnegative()
const game = z.object({
  id: identifier, name: text.min(1), process: text.min(1), pid: counter,
  emulator: z.boolean().optional(), version: text.optional(), launchSource: source.optional(),
  executable: text.optional(), architecture: z.enum(['x86', 'x64']).optional(),
  launchMethod: z.enum(['direct', 'cmd', 'le', 'lr', 'ntleas']).optional(), commandLine: text.optional(),
  localeProfile: text.optional(), charactersRead: counter.optional(), playSeconds: counter.optional(),
  lists: z.array(text).optional(), originalId: identifier.optional(),
}) satisfies z.ZodType<DemoGame>
const profile = z.object({
  threads: z.array(z.enum(['dialogue', 'name', 'menu'])).transform(values => [...new Set(values)]),
  embedded: z.boolean(), embedMode: z.enum(['translated', 'originalFirst', 'translatedFirst', 'original']).optional(),
}) satisfies z.ZodType<Profile>
const entry = z.object({
  original: z.string(), translation: z.string(), id: counter.positive(), gameId: identifier.nullable(),
  origin: z.enum(['memory', 'gateway', 'input']),
}) satisfies z.ZodType<Entry>
const hook = z.object({
  codePage: z.number().int().refine(value => hookCodePages.includes(value)), flushDelay: counter.max(10000),
  bufferSize: counter.max(1000000), historySize: counter.max(1000000000), outputSize: counter.max(1000000000),
  waitSeconds: z.number().min(0).max(30), clearText: z.boolean(), convertKanji: z.boolean(), limitWidth: z.boolean(),
  lineWidth: counter.max(1000), changeFont: z.boolean(), font: text, changeScale: z.boolean(), scale: z.number().min(0.5).max(2),
}) satisfies z.ZodType<HookSettings>
const settings = z.object({
  source, from: language.or(z.literal('auto')), to: language, showOriginal: z.boolean(),
  showTranslation: z.boolean(), fontSize: z.number().min(1).max(100).catch(16),
  originalFontSize: z.number().min(5).max(100).default(16).catch(16), showProvider: z.boolean().default(false),
  hookSettings: hook.default(defaultHookSettings).catch(defaultHookSettings),
  ruleEnabled: z.boolean(), memoryEnabled: z.boolean(), threadSeparator: z.string().max(64).default('\n'),
})
const archive = z.object({
  version: z.literal(1), games: z.array(z.unknown()), recentIds: z.array(identifier).catch([]),
  profiles: z.record(z.string(), z.unknown()).catch({}), entries: z.array(z.unknown()).catch([]),
  settings: settings.optional().catch(undefined),
})

type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>

export function loadDemoSession(ui: UiLanguage, storage?: StorageAccess): DemoSession {
  const session = newSession(ui)
  try {
    const raw = (storage ?? window.localStorage).getItem(key)
    if (!raw) return session
    const saved = archive.safeParse(JSON.parse(raw))
    if (!saved.success) return session
    const data = saved.data
    const ids = new Set<string>()
    for (const row of data.games) {
      const parsed = game.safeParse(row)
      if (!parsed.success || ids.has(parsed.data.id)) continue
      ids.add(parsed.data.id)
      session.games.push(parsed.data)
      const state = profile.safeParse(data.profiles[parsed.data.id])
      if (state.success) session.profiles[parsed.data.id] = state.data
    }
    session.recentIds = [...new Set(data.recentIds)].filter(id => ids.has(id)).slice(0, 10)
    const entryIds = new Set<number>()
    for (const row of data.entries) {
      const parsed = entry.safeParse(row)
      if (!parsed.success) continue
      const item = parsed.data
      if (entryIds.has(item.id) || (item.gameId !== null && !ids.has(item.gameId))) continue
      entryIds.add(item.id)
      session.sequence = Math.max(session.sequence, item.id)
      session.entries.push(item)
    }
    if (data.settings) Object.assign(session, data.settings)
    // OCR and clipboard sources would start collecting immediately if restored as enabled.
    session.enabled = session.source === 'hook'
    return session
  } catch {
    return newSession(ui)
  }
}

export function saveDemoSession(session: DemoSession, storage?: StorageAccess): boolean {
  try {
    const payload = { version: 1, games: session.games, recentIds: session.recentIds, profiles: session.profiles,
      entries: session.entries, settings: settings.parse(session) }
    const target = storage ?? window.localStorage
    target.setItem(key, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}
