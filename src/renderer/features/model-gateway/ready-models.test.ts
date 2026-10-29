import { expect, it } from 'vitest'
import type { AvailableModel, AvailableModels } from '../../available-models'
import { callableModels, type PlaygroundModel } from '../workbench/installed-models'

const model = (binding: string, kind: AvailableModel['kind'], name: string, origin: AvailableModel['origin']): AvailableModel =>
  ({ binding, kind, name, origin, free: origin === 'gateway' })

const catalog: AvailableModels = {
  llm: [model('custom:chat', 'llm', 'Gateway chat', 'gateway')],
  asr: [model('resource:sense-voice', 'asr', 'SenseVoice', 'gateway'), model('cloud:aliyun', 'asr', 'Aliyun ASR', 'cloud')],
  mt: [model('mt-custom:deepl', 'mt', 'DeepL proxy', 'cloud')],
  tts: [],
}

const playground: PlaygroundModel[] = [
  { id: 'custom:chat', kind: 'llm', name: 'Saved chat', contextWindow: 4096 },
  { id: 'resource:other', kind: 'llm', name: 'Installed but stopped' },
]

it('lists gateway-loaded models and configured cloud interfaces, keeping catalog metadata', () => {
  expect(callableModels(catalog, playground)).toEqual([
    { id: 'custom:chat', kind: 'llm', name: 'Gateway chat', contextWindow: 4096 },
    { id: 'resource:sense-voice', kind: 'asr', name: 'SenseVoice' },
    { id: 'cloud:aliyun', kind: 'asr', name: 'Aliyun ASR' },
    { id: 'mt-custom:deepl', kind: 'mt', name: 'DeepL proxy' },
  ])
})

it('drops a capability once the gateway no longer loads it and nothing is configured', () => {
  const stopped: AvailableModels = { ...catalog, llm: [], tts: [] }
  expect(callableModels(stopped, playground).filter(item => item.kind === 'llm')).toEqual([])
  expect(callableModels({ llm: [], asr: [], mt: [], tts: [] }, playground)).toEqual([])
})
