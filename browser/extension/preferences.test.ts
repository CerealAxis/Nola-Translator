import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, matchesSitePatterns, siteEnabled, readPreferences } from './preferences'
import { extensionCopy, extensionLocales } from './extension-copy'
import { uiCopy } from './ui-copy'
import { browserZh, browserEn } from './locale-base'
import { browserJa, browserKo, browserZhHK, browserZhTW } from './locale-regions'

describe('extension preferences', () => {
  it('upgrades legacy preferences without losing the chosen languages and pipeline', () => {
    const settings = readPreferences({ pageLanguage: 'en', videoLanguage: 'ja', pipeline: 's2s', autoSites: ['https://example.com'] })
    expect(settings).toMatchObject({ pageLanguage: 'en', videoLanguage: 'ja', pipeline: 's2s', pageProvider: 'desktop', autoSites: ['https://example.com'], contextAware: false })
  })
  it('validates imported values and discards malformed terms and rules', () => {
    const settings = readPreferences({ sourceLanguage: '<invalid>', subtitleSize: 900, ttsRate: NaN, batchSize: -2, glossary: [null, { source: 'API', target: '接口', sites: '' }, { source: 4 }], siteRules: [null, { host: 'example.com', includeSelectors: 'article', excludeSelectors: '.ad' }] })
    expect(settings.sourceLanguage).toBe('auto')
    expect(settings.subtitleSize).toBe(60)
    expect(settings.ttsRate).toBe(1)
    expect(settings.batchSize).toBe(1)
    expect(settings.glossary).toHaveLength(1)
    expect(settings.siteRules).toHaveLength(1)
    expect(readPreferences({ autoSites: ['http://localhost:8080', 'https://example.com'] }).autoSites).toEqual(['http://localhost:8080', 'https://example.com'])
    expect(readPreferences({ pipeline: 'desktop' }).pipeline).toBe('cascade')
    expect(readPreferences({})).toEqual(DEFAULT_PREFERENCES)
  })
  it('ships all extension strings and base keys in six complete independent dictionaries', () => {
    for (const values of [...Object.values(extensionCopy), ...Object.values(uiCopy)]) { expect(values).toHaveLength(extensionLocales.length); for (const value of values) expect(value.trim()).not.toBe('') }
    const keys = Object.keys(browserZh).sort()
    for (const dictionary of [browserEn, browserJa, browserKo, browserZhHK, browserZhTW]) expect(Object.keys(dictionary).sort()).toEqual(keys)
  })
})

it('matches website scope independently for global, floating and selection controls', () => {
  expect(matchesSitePatterns(['example.com'], 'https://news.example.com/article')).toBe(true)
  expect(matchesSitePatterns(['https://example.com/docs/*'], 'https://example.com/docs/a?q=1')).toBe(true)
  expect(matchesSitePatterns(['*.example.com'], 'https://example.com/')).toBe(true)
  expect(matchesSitePatterns(['example.com'], 'https://notexample.com/')).toBe(false)
  expect(siteEnabled({ siteBlacklist: ['example.com'] }, 'https://example.com/')).toBe(false)
  const settings = readPreferences({ floatingSide: 'invalid', floatingPosition: 3, floatingClickAction: 'bad', selectionOpacity: 0.01, inputTrigger: 'other' })
  expect(settings).toMatchObject({ floatingSide: 'right', floatingPosition: 1, floatingClickAction: 'translate', selectionOpacity: 0.2, inputTrigger: 'tripleSpace' })
})

it('migrates legacy subtitle appearance and accepts only bounded website patterns', () => {
  const settings = readPreferences({ subtitleFont: 'Arial', subtitleColor: '#123456', subtitleSize: 24, autoSites: ['example.com', '*.example.org', 'http://localhost:8080/docs/*', 'https://example.com/path/*', 'javascript:alert(1)', 'ftp://example.com', 'https://user:password@example.com', 'x'.repeat(2049)] })
  expect(settings).toMatchObject({ subtitleSourceFont: 'Arial', subtitleTranslationFont: 'Arial', subtitleSourceColor: '#123456', subtitleTranslationColor: '#123456', subtitleSourceSize: 24, subtitleTranslationSize: 24 })
  expect(settings.autoSites).toEqual(['example.com', '*.example.org', 'http://localhost:8080/docs/*', 'https://example.com/path/*'])
  expect(readPreferences({ subtitleSourceSize: 900, subtitleSourceColor: 'red;}body{color:red', subtitleTranslationSize: 10 })).toMatchObject({ subtitleSourceSize: 60, subtitleSourceColor: '#ffffff', subtitleTranslationSize: 10 })
})
