import { describe, expect, it } from 'vitest'
import { appNameForLanguage, windowTitleForUrl } from '../../../src/shared/window-titles'
import type { UiLanguage } from '../../../src/shared/languages'

describe('localized native window titles', () => {
  it.each(['zh-CN', 'zh-TW', 'zh-HK', 'ko', 'ja', 'en'] as UiLanguage[])('names every independent surface in %s', language => {
    const brand = appNameForLanguage(language)
    const roles = ['workbench.html', 'comic-editor.html', 'latency.html', 'screen.html', 'screen.html?role=game-overlay', 'index.html?workspace=1', 'index.html?overlay=1', 'onboarding-card.html', 'index.html?migration=1', 'index.html?overlay=1&overlayMenu=1']
    const titles = roles.map(role => windowTitleForUrl(`http://localhost/${role}`, language))
    expect(new Set(titles).size).toBe(roles.length)
    for (const title of titles) { expect(title).toContain(brand); expect(title).not.toBe(brand) }
    expect(windowTitleForUrl('http://localhost/index.html', language)).toBe(brand)
  })
})
