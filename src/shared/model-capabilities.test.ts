import { describe, expect, it } from 'vitest'
import type { ResourceRecord } from './contracts'
import { parseCommandLine, parseEventLine } from './schemas'
import { configurationOf, isModelReady, modelConfigurationSchema, recognitionLanguages, supportsTranslation, translationLanguages } from './model-capabilities'
import type { ModelConfiguration } from './model-capabilities'
import { LANGUAGE_LABELS } from './languages'

function record(id: string, configuration?: ModelConfiguration): ResourceRecord {
  return { resourceId: id, kind: 'translationModel', provider: 'llama.cpp', name: id, description: 'Test model', languages: [], installed: true, installedBytes: 0, state: 'idle', cancellable: false, configuration }
}
const bilingual: ModelConfiguration = { slot: 'translation', engine: 'llama', languages: [], supportsAutoDetection: false, sourceLanguages: ['en', 'ja'], targetLanguages: ['en', 'ja'] }

describe('model language capabilities', () => {
  it('migrates recommended capabilities with their full language lists', () => {
    expect(recognitionLanguages(record('sensevoice-small'))).toEqual(['auto', 'zh', 'en', 'yue', 'ja', 'ko'])
    expect(configurationOf(record('qwen3-asr-1.7b-hf'))?.languages).toHaveLength(30)
    expect(configurationOf(record('m2m100-418m'))?.sourceLanguages).toHaveLength(100)
    expect(translationLanguages(record('hy-mt2-1.8b-q4-k-m'), 'en')).toContain('zh-Hant')
  })
  it('retains custom downloads but refuses to enable them without a configuration', () => {
    const pending = record('hub:test/custom')
    expect(isModelReady(pending)).toBe(false)
    expect(recognitionLanguages(pending)).toEqual([])
    expect(translationLanguages(pending, 'en')).toEqual(['none'])
    expect(isModelReady(record(pending.resourceId, bilingual))).toBe(true)
  })
  it('retains the official Hy-MT2 Tibetan and Cantonese targets with readable names', () => {
    const targets = translationLanguages(record('hy-mt2-1.8b-q4-k-m'), 'en')
    expect(targets).toContain('bo')
    expect(targets).toContain('yue')
    expect(LANGUAGE_LABELS.bo).toEqual({ code: 'bo', zh: '藏语', en: 'Tibetan' })
    expect(LANGUAGE_LABELS.yue).toEqual({ code: 'yue', zh: '粤语', en: 'Cantonese' })
  })
  it('allows Chinese recognition while rejecting it as a source of the English/Japanese translator', () => {
    const translator = record('hub:test/bilingual', bilingual)
    expect(recognitionLanguages(record('sensevoice-small'))).toContain('zh')
    expect(supportsTranslation(translator, 'zh', 'en')).toBe(false)
    expect(translationLanguages(translator, 'zh')).toEqual(['none'])
    expect(supportsTranslation(translator, 'auto', 'en')).toBe(true)
    expect(supportsTranslation(translator, 'ja', 'en')).toBe(true)
  })
  it('checks directional pairs and code aliases without assuming reverse translation', () => {
    const translator = record('hub:test/directional', { ...bilingual, translationPairs: [{ source: 'en', target: 'ja' }] })
    expect(supportsTranslation(translator, 'en', 'ja')).toBe(true)
    expect(supportsTranslation(translator, 'ja', 'en')).toBe(false)
    expect(supportsTranslation(translator, 'auto', 'en')).toBe(false)
    expect(supportsTranslation(record('hy-mt2-1.8b-q4-k-m'), 'fil', 'zh-TW')).toBe(true)
  })
  it('rejects incomplete language declarations and pairs outside selected languages', () => {
    expect(modelConfigurationSchema.safeParse({ ...bilingual, sourceLanguages: [] }).success).toBe(false)
    expect(modelConfigurationSchema.safeParse({ ...bilingual, translationPairs: [] }).success).toBe(false)
    expect(modelConfigurationSchema.safeParse({ ...bilingual, translationPairs: [{ source: 'zh', target: 'en' }] }).success).toBe(false)
  })
  it('carries full capabilities through both protocol boundaries', () => {
    const translator = record('m2m100-418m')
    const config = configurationOf(translator)!
    const event = parseEventLine(JSON.stringify({ protocolVersion: 1, requestId: 'test', type: 'resourceChanged', resource: { ...translator, languages: config.sourceLanguages, configuration: config } }))
    expect(event.type).toBe('resourceChanged')
    if (event.type === 'resourceChanged') expect(event.resource.configuration?.sourceLanguages).toHaveLength(100)
    expect(parseCommandLine(JSON.stringify({ protocolVersion: 1, requestId: 'save', type: 'configureModel', resourceId: 'hub:test/model', configuration: bilingual })).type).toBe('configureModel')
  })
})
