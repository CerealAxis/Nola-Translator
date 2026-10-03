import { describe, expect, it } from 'vitest'
import type { HubModelSummary } from '@/bridge'
import { hubCardRecord, installSlotOf, mergeHubResults } from './HubSearchTab'
import type { HubHit } from './HubSearchTab'

function hit(over: Partial<HubModelSummary> = {}, kind: HubHit['kind'] = 'all'): HubHit {
  return { kind, summary: {
    repo: 'org/model', resourceId: 'hub:org/model', author: 'org',
    hasGguf: false, fileCount: 4, installed: false, formats: ['pytorch'],
    ...over,
  } }
}

describe('Hugging Face model cards', () => {
  it('uses the hub description even when a runtime verdict contains a refusal', () => {
    const row = hit({ description: 'A multilingual speech recognition model.', compatibility: {
      compatible: false, reasonCode: 'unsupportedArchitecture', reason: 'Internal loader diagnosis',
      languages: [], evidence: {},
    } })
    expect(hubCardRecord(row).description).toBe('A multilingual speech recognition model.')
  })

  it('does not replace a missing description with installation analysis', () => {
    expect(hubCardRecord(hit()).description).toBe('')
  })

  it('keeps repository identity, installation state and library metadata', () => {
    const record = hubCardRecord(hit({ libraryName: 'transformers', installed: true }))
    expect(record.resourceId).toBe('hub:org/model')
    expect(record.provider).toBe('transformers')
    expect(record.installed).toBe(true)
  })

  it('selects recognition from pipeline metadata on an all-model search', () => {
    expect(installSlotOf(hit({ pipelineTag: 'automatic-speech-recognition' }))).toBe('recognition')
    expect(installSlotOf(hit({ hasGguf: true, formats: ['gguf'] }, 'quant'))).toBe('translation')
    expect(installSlotOf(hit({}, 'asr'))).toBe('recognition')
  })

  it('deduplicates repositories without changing their rank', () => {
    const row = hit().summary
    const result = { query: '', models: [row], candidates: 8, rateLimited: false }
    expect(mergeHubResults([{ kind: 'asr', result }, { kind: 'mt', result }]).hits).toHaveLength(1)
  })
})
