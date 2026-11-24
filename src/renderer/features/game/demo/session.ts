import type { UiLanguage } from '../../../../shared/languages'
import type { DemoGame, EmbedMode } from './DemoGames'

export type TextSource = 'hook' | 'ocr' | 'clipboard'
export type CapabilityState = 'ready' | 'offline' | 'missing' | 'unsupported' | 'loading' | 'failed'
export type Line = { original: string; translation: string }
export type Entry = Line & { id: number; gameId: string | null; origin: 'memory' | 'gateway' | 'input' }
export type Profile = { threads: string[]; embedded: boolean; embedMode?: EmbedMode }
export const defaultHookSettings = {
  codePage: 0, flushDelay: 500, bufferSize: 3000, historySize: 1000000, outputSize: 10000,
  waitSeconds: 2, clearText: false, convertKanji: false, limitWidth: false, lineWidth: 40,
  changeFont: false, font: '', changeScale: false, scale: 1,
}
export type HookSettings = typeof defaultHookSettings
export const hookCodePages = [0, 932, 65001, 936, 950, 949, 1258, 874, 1256, 1255, 1254, 1253, 1257, 1250, 1251, 1252, 437]

const samples = [
  { ja: 'この手紙、あなた宛てです。', zh: '这封信是寄给你的。', 'zh-Hant': '這封信是寄給你的。', en: 'This letter is for you.', ko: '이 편지, 당신 앞으로 왔어요.' },
  { ja: '差出人の名前はありません。', zh: '上面没有写寄信人的名字。', 'zh-Hant': '上面沒有寫寄信人的名字。', en: 'There’s no sender’s name on it.', ko: '보낸 사람의 이름이 없어요.' },
  { ja: '中を確かめてみませんか？', zh: '要不要打开看看？', 'zh-Hant': '要不要打開看看？', en: 'Shall we open it and see?', ko: '열어 볼까요?' },
] as const
export type SampleLanguage = keyof typeof samples[number]
export const sampleLanguages: SampleLanguage[] = ['ja', 'zh', 'zh-Hant', 'en', 'ko']
export const characterNames = { ja: '澪', zh: '澪', 'zh-Hant': '澪', en: 'Mio', ko: '미오' }
export const menu = { ja: '手紙を受け取る', zh: '接过信件', 'zh-Hant': '接過信件', en: 'Take the letter', ko: '편지 받기' }
const ferry = { ja: '次の船は 08:40 に出航します。', zh: '下一班船 08:40 出发。', 'zh-Hant': '下一班船 08:40 出發。', en: 'The next ferry leaves at 08:40.', ko: '다음 배는 08:40에 출발합니다.' }
const terms = [
  { ja: '港', zh: '港口', 'zh-Hant': '港口', en: 'Harbor', ko: '항구' },
  { ja: '船', zh: '船', 'zh-Hant': '船', en: 'Ship', ko: '배' },
]
export const freshProfile = (): Profile => ({ threads: [], embedded: false })

export function sampleLine(index: number, source: SampleLanguage | 'auto', target: SampleLanguage): Line {
  const row = samples[index % samples.length]
  return { original: row[source === 'auto' ? 'ja' : source], translation: row[target] }
}

export function lookupSample(text: string, target: SampleLanguage): string | undefined {
  return [...samples, ...terms, characterNames, menu, ferry].find(row => Object.values(row).some(value => value === text))?.[target]
}

export function lookupMemory(text: string, source: SampleLanguage | 'auto', target: SampleLanguage): string | undefined {
  const from = source === 'auto' ? 'ja' : source
  return [samples[0], ...terms].find(row => row[from] === text)?.[target]
}

export function hookLine(index: number, session: DemoSession, profile: Profile): Line | undefined {
  const from = session.from === 'auto' ? 'ja' : session.from
  const dialogue = sampleLine(index, from, session.to)
  const candidates = [
    { thread: 'name', original: characterNames[from], translation: characterNames[session.to] },
    { thread: 'dialogue', ...dialogue },
    { thread: 'menu', original: menu[from], translation: menu[session.to] },
  ]
  const rows = profile.threads.flatMap(thread => candidates.filter(row => row.thread === thread))
  if (!rows.length) return undefined
  const original = rows.map(row => row.original).join(session.threadSeparator)
  if (Array.from(original).length > session.hookSettings.outputSize) return undefined
  return { original, translation: rows.map(row => row.translation).join(session.threadSeparator) }
}

export interface DemoSession {
  games: DemoGame[]
  recentIds: string[]
  profiles: Record<string, Profile>
  source: TextSource
  enabled: boolean
  gameId: string | null
  boundWindow?: DemoGame
  startedAt?: number
  foregroundSince?: number
  foregroundElapsed?: number
  activeThreads?: string[]
  paused: boolean
  from: SampleLanguage | 'auto'
  to: SampleLanguage
  showOriginal: boolean
  showTranslation: boolean
  fontSize: number
  originalFontSize: number
  showProvider: boolean
  hookSettings: HookSettings
  ruleEnabled: boolean
  threadSeparator: string
  memoryEnabled: boolean
  capability: CapabilityState
  step: number
  sequence: number
  current: number | null
  entries: Entry[]
}

export function newSession(language: UiLanguage): DemoSession {
  const to = language === 'zh-CN' ? 'zh' : language.startsWith('zh') ? 'zh-Hant' : language as SampleLanguage
  return { games: [], recentIds: [], profiles: {}, source: 'hook', enabled: true, gameId: null,
    paused: false, from: 'auto', to, showOriginal: true, showTranslation: true, fontSize: 16, originalFontSize: 16, showProvider: false,
    hookSettings: { ...defaultHookSettings },
    ruleEnabled: true, threadSeparator: '\n', memoryEnabled: true, capability: 'ready', step: 0, sequence: 0, current: null, entries: [] }
}

export function registerGame(games: DemoGame[], game: DemoGame): DemoGame[] {
  if (!games.some(item => item.id === game.id)) return [...games, game]
  return games.map(item => item.id === game.id && game.version ? { ...item, version: game.version } : item)
}

export function getActiveProfile(session: DemoSession): Profile {
  const saved = (session.gameId && session.profiles[session.gameId]) || freshProfile()
  return session.activeThreads === undefined ? saved : { ...saved, threads: session.activeThreads }
}

export function updateActiveProfile(session: DemoSession, change: Partial<Profile>): DemoSession {
  if (!session.gameId) return session
  const stored = session.profiles[session.gameId] ?? freshProfile()
  return { ...session, current: null, activeThreads: change.threads ?? session.activeThreads,
    profiles: { ...session.profiles, [session.gameId]: { ...stored, ...change } } }
}

export function setGameFocused(session: DemoSession, focused: boolean, now = Date.now()): DemoSession {
  if (session.startedAt === undefined || focused === (session.foregroundSince !== undefined)) return session
  if (focused) return { ...session, foregroundSince: now }
  return { ...session, foregroundSince: undefined,
    foregroundElapsed: (session.foregroundElapsed ?? 0) + Math.max(0, now - (session.foregroundSince ?? now)) }
}

export function endGameSession(session: DemoSession, now = Date.now()): DemoSession {
  const stopped = setGameFocused(session, false, now)
  const id = stopped.gameId
  const played = id !== null && stopped.startedAt !== undefined && stopped.games.some(game => game.id === id)
  return { ...stopped,
    games: played ? stopped.games.map(game => game.id === id
      ? { ...game, playSeconds: (game.playSeconds ?? 0) + Math.floor((stopped.foregroundElapsed ?? 0) / 1000) } : game) : stopped.games,
    recentIds: played ? [id, ...stopped.recentIds.filter(recentId => recentId !== id)].slice(0, 10) : stopped.recentIds,
    enabled: false, paused: false, current: null, gameId: null, boundWindow: undefined, startedAt: undefined,
    foregroundSince: undefined, foregroundElapsed: undefined, activeThreads: undefined,
  }
}

export function unbindGameWindow(session: DemoSession, now = Date.now()): DemoSession {
  return { ...endGameSession(session, now), enabled: session.enabled }
}

export function startGameSession(session: DemoSession, selected: DemoGame, options: { launch?: boolean; now?: number } = {}): DemoSession {
  const now = options.now ?? Date.now()
  const previous = endGameSession(session, now)
  const source = options.launch ? selected.launchSource ?? session.source : session.source
  const games = options.launch || source === 'hook' ? registerGame(previous.games, selected) : previous.games
  const gameId = games.find(game => game.id === selected.id)?.id ?? null
  const profiles = gameId && !previous.profiles[gameId]
    ? { ...previous.profiles, [gameId]: freshProfile() } : previous.profiles
  return { ...previous, games, profiles, source, gameId, boundWindow: selected, enabled: true,
    startedAt: gameId ? now : undefined, foregroundSince: gameId ? now : undefined, foregroundElapsed: 0,
    activeThreads: !options.launch && source === 'hook' ? [] : undefined, step: 0,
  }
}

export function appendEntry(session: DemoSession, line: Line, origin: Entry['origin']): DemoSession {
  const id = session.sequence + 1
  return { ...session, sequence: id, current: id, entries: [...session.entries, { ...line, origin, gameId: session.gameId, id }],
    games: session.games.map(game => game.id === session.gameId
      ? { ...game, charactersRead: (game.charactersRead ?? 0) + Array.from(line.original).length } : game) }
}
