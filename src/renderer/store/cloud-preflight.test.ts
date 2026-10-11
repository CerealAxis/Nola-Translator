import { expect, it } from 'vitest'
import { findMissingResource } from './sessionStore'
import type { SessionConfig } from '../../shared/contracts'

const remote: SessionConfig = { audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime', recognitionProvider: 'aliyun', recognitionModelId: 'sensevoice-small', sourceLanguage: 'auto', targetLanguages: ['zh'], translationProvider: 'mymemory' }

it('does not require local ASR weights for remote recognition or remote translation', () => {
  expect(findMissingResource({ resources: [] }, remote)).toBeNull()
  expect(findMissingResource({ resources: [] }, { ...remote, targetLanguages: [], translationProvider: 'recognition' })).toBeNull()
})

it('still preflights the local translator used with remote recognition', () => {
  const config = { ...remote, translationProvider: 'local' as const, translationModelId: 'hy-mt2-1.8b-q3-k-m' }
  expect(findMissingResource({ resources: [] }, config)).toMatchObject({ kind: 'translation', resourceId: config.translationModelId })
  expect(findMissingResource({ resources: [{ resourceId: config.translationModelId, name: 'Translator', installed: true }] }, config)).toBeNull()
  expect(findMissingResource({ resources: [] }, { ...remote, recognitionProvider: 'local' })).toMatchObject({ kind: 'recognition', resourceId: 'sensevoice-small' })
})
