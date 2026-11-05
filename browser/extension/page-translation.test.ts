import { waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createPageTranslation } from './page-translation'
import { DEFAULT_PREFERENCES } from './preferences'

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren() })

it('keeps interactive DOM, ignores forms, translates new paragraphs and restores original text', async () => {
  document.documentElement.lang = 'en'
  document.body.innerHTML = '<article><p id="intro">Hello <a href="#details">details</a></p><form><p id="form-label">Search</p></form></article>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const link = document.querySelector('a')!
  const translate = vi.fn(async (text: string) => `T ${text}`)
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, pageDisplay: 'translation' })
    page.start()
    await waitFor(() => expect(link.textContent).toBe('T details'))
    expect(document.querySelector('a')).toBe(link)
    expect(link.getAttribute('href')).toBe('#details')
    expect(document.querySelector('#form-label')?.textContent).toBe('Search')
    const added = document.createElement('p')
    added.textContent = 'A new paragraph'
    document.querySelector('article')?.append(added)
    await waitFor(() => expect(added.textContent).toBe('T A new paragraph'))
    page.stop()
    expect(link.textContent).toBe('details')
    expect(document.querySelector('#intro')?.textContent).toBe('Hello details')
    expect(added.textContent).toBe('A new paragraph')
    expect(translate.mock.calls.flat()).not.toContain('Search')
  } finally { page.stop(); document.documentElement.removeAttribute('lang') }
})

it('translates and restores a changing title, applies site exclusions and language skips', async () => {
  const original = document.title
  document.title = 'Initial title'
  document.body.innerHTML = '<main><p lang="ja">Skipped Japanese</p><p class="private">Private paragraph</p><p id="public">Public paragraph</p></main><p id="outside">Outside paragraph</p>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const translate = vi.fn(async (text: string) => `T ${text}`)
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, pageDisplay: 'translation', skipLanguages: ['ja'], siteRules: [{ host: location.hostname, excludeSelectors: '.private', includeSelectors: '' }] })
    page.start()
    await waitFor(() => expect(document.querySelector('#public')?.textContent).toBe('T Public paragraph'))
    expect(document.title).toBe('T Initial title')
    expect(document.querySelector('.private')?.textContent).toBe('Private paragraph')
    expect(document.querySelector('[lang=ja]')?.textContent).toBe('Skipped Japanese')
    expect(document.querySelector('#outside')?.textContent).toBe('Outside paragraph')
    document.title = 'Changed title'
    await waitFor(() => expect(document.title).toBe('T Changed title'))
    page.stop(); expect(document.title).toBe('Changed title')
  } finally { page.stop(); document.title = original }
})

it('uses the explicit source for paragraphs and titles and blocks every start on disabled sites', async () => {
  const originalTitle = document.title; document.title = 'A title'
  document.body.innerHTML = '<main><p lang="ja">A paragraph</p></main>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const translate = vi.fn(async (text: string) => `T ${text}`)
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, sourceLanguage: 'en', pageDisplay: 'translation' })
    page.start()
    await waitFor(() => expect(document.querySelector('p')?.textContent).toBe('T A paragraph'))
    expect(translate).toHaveBeenCalledWith('A title', 'en', 'zh', 'web', expect.any(AbortSignal))
    expect(translate).toHaveBeenCalledWith('A paragraph', 'en', 'zh', 'web', expect.any(AbortSignal))
    page.configure({ ...DEFAULT_PREFERENCES, sourceLanguage: 'en', siteBlacklist: [location.hostname] })
    expect(page.state().pageActive).toBe(false)
    expect(document.querySelector('p')?.textContent).toBe('A paragraph')
    translate.mockClear(); page.start(); page.hover(new PointerEvent('pointerover', { altKey: true }))
    expect(page.state().pageActive).toBe(false)
    expect(translate).not.toHaveBeenCalled()
  } finally { page.stop(); document.title = originalTitle }
})
