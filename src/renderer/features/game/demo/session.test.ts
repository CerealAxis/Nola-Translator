import { beforeEach, expect, it } from 'vitest'
import { demoGames, embeddedText } from './DemoGames'
import { appendEntry, defaultHookSettings, endGameSession, getActiveProfile, hookLine, newSession, setGameFocused, startGameSession, unbindGameWindow, updateActiveProfile } from './session'
import { loadDemoSession, saveDemoSession } from './session-persistence'

const [harbor, letters] = demoGames

beforeEach(() => localStorage.clear())

it('counts only foreground time and orders recent games by session completion', () => {
  let session = startGameSession(newSession('en'), harbor, { now: 1000 })
  expect(session.recentIds).toEqual([])
  session = setGameFocused(session, false, 2500)
  session = setGameFocused(session, true, 9000)
  session = startGameSession(session, letters, { now: 10500 })
  expect(session.games[0].playSeconds).toBe(3)
  expect(session.recentIds).toEqual([harbor.id])
  session = endGameSession(session, 12500)
  expect(session.games[1].playSeconds).toBe(2)
  expect(session.recentIds).toEqual([letters.id, harbor.id])
  expect(endGameSession(session, 20000).games).toEqual(session.games)
})

it('only associates existing profiles when binding an OCR or clipboard window', () => {
  for (const source of ['ocr', 'clipboard'] as const) {
    let session = startGameSession({ ...newSession('en'), source }, harbor, { now: 100 })
    expect(session.boundWindow?.id).toBe(harbor.id)
    expect(session.games).toEqual([])
    expect(session.gameId).toBeNull()
    session = unbindGameWindow(session, 200)
    expect(session.enabled).toBe(true)
    expect(session.boundWindow).toBeUndefined()
    session = startGameSession({ ...session, games: [letters] }, letters, { now: 300 })
    expect(session.gameId).toBe(letters.id)
    expect(session.games).toEqual([letters])
  }
})

it('restores ordered threads on library launch and keeps saved display threads across manual selection', () => {
  let session = startGameSession(newSession('zh-CN'), harbor)
  session = updateActiveProfile(session, { threads: ['menu', 'dialogue'], embedded: true })
  session = startGameSession(session, harbor)
  expect(getActiveProfile(session)).toMatchObject({ threads: [], embedded: true })
  session = updateActiveProfile(session, { embedMode: 'originalFirst' })
  session = startGameSession(session, harbor, { launch: true })
  expect(getActiveProfile(session)).toMatchObject({ threads: ['menu', 'dialogue'], embedded: true, embedMode: 'originalFirst' })
  expect(hookLine(0, { ...session, threadSeparator: ' / ' }, getActiveProfile(session))?.original)
    .toBe('手紙を受け取る / この手紙、あなた宛てです。')
})

it('restores durable settings, profiles and history without starting the previous capture session', () => {
  let session = startGameSession(newSession('en'), { ...harbor, launchSource: 'ocr' }, { launch: true, now: 0 })
  session = updateActiveProfile(session, { threads: ['dialogue'], embedded: false })
  session = appendEntry(session, { original: '港', translation: 'Harbor' }, 'gateway')
  expect(saveDemoSession(session)).toBe(true)
  const restored = loadDemoSession('en')
  expect(restored.games).toEqual(session.games)
  expect(restored.profiles).toEqual(session.profiles)
  expect(restored.entries).toEqual(session.entries)
  expect(restored).toMatchObject({ gameId: null, current: null, source: 'ocr', enabled: false, sequence: 1 })
  expect(restored.boundWindow).toBeUndefined()
  expect(restored.startedAt).toBeUndefined()
})

it('falls back on unreadable data and salvages valid games from partially invalid archives', () => {
  expect(loadDemoSession('ko').to).toBe('ko')
  expect(saveDemoSession({ ...newSession('en'), games: [harbor] })).toBe(true)
  const key = localStorage.key(0)!
  const data = JSON.parse(localStorage.getItem(key)!)
  data.games.push({ id: 'incomplete' }, { ...harbor, id: '__proto__' })
  data.recentIds = ['incomplete', harbor.id, harbor.id]
  localStorage.setItem(key, JSON.stringify(data))
  expect(loadDemoSession('en').games).toEqual([harbor])
  expect(loadDemoSession('en').recentIds).toEqual([harbor.id])
  localStorage.setItem(key, 'broken')
  expect(loadDemoSession('en')).toEqual(newSession('en'))
})

it('applies embedded text limits and keeps the original when the translation misses its deadline', () => {
  expect(embeddedText('translated', 'original', '😀二三四', { ...defaultHookSettings, limitWidth: true, lineWidth: 2 })).toBe('😀二\n三四')
  expect(embeddedText('originalFirst', 'A', 'B', { ...defaultHookSettings, waitSeconds: 1 }, 1200)).toBe('A')
  expect(embeddedText('original', 'A', 'B', { ...defaultHookSettings, clearText: true })).toBe('')
  expect(embeddedText('translated', 'A', '过桥', { ...defaultHookSettings, convertKanji: true })).toBe('過橋')
  const s = newSession('en')
  expect(s).toMatchObject({ fontSize: 16, originalFontSize: 16, showProvider: false })
  s.hookSettings.outputSize = 2
  expect(hookLine(0, s, { threads: ['dialogue'], embedded: false })).toBeUndefined()
  expect(saveDemoSession(s)).toBe(true)
  expect(loadDemoSession('en').hookSettings.outputSize).toBe(2)
})
