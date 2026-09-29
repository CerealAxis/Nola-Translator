import messages from '../../fixtures/protocol/messages.json'

import { MAX_PROTOCOL_LINE_BYTES, parseCommandLine, parseEventLine } from '../../../src/shared/schemas'

describe('JSONL 协议校验', () => {
  it('接受 TS 与 Python 共用的全部命令样例', () => {
    for (const command of messages.commands) {
      expect(parseCommandLine(JSON.stringify(command))).toMatchObject(command)
    }
  })

  it('接受 TS 与 Python 共用的全部事件样例', () => {
    for (const event of messages.events) {
      expect(parseEventLine(JSON.stringify(event))).toMatchObject(event)
    }
  })

  it('拒绝未知类型、缺少 requestId 和负数 revision', () => {
    expect(() =>
      parseCommandLine(JSON.stringify({ protocolVersion: 1, type: 'unknown', requestId: 'req-1' }))
    ).toThrow()
    expect(() => parseCommandLine(JSON.stringify({ protocolVersion: 1, type: 'listDevices' }))).toThrow()

    const caption = structuredClone(messages.events[1]) as { segment: { revision: number } }
    caption.segment.revision = -1
    expect(() => parseEventLine(JSON.stringify(caption))).toThrow()
  })

  it('忽略未知非关键字段以支持向后兼容', () => {
    const command = { ...messages.commands[0], futureOptionalField: true }
    expect(parseCommandLine(JSON.stringify(command))).not.toHaveProperty('futureOptionalField')
  })

  it('拒绝超过 32 KiB 的单行', () => {
    const oversized = JSON.stringify({
      protocolVersion: 1,
      type: 'hello',
      requestId: 'req-large',
      clientVersion: 'x'.repeat(MAX_PROTOCOL_LINE_BYTES)
    })
    expect(() => parseCommandLine(oversized)).toThrow(/32 KiB/)
  })

  it('校验显式资源管理命令和状态事件', () => {
    expect(parseCommandLine(JSON.stringify({
      protocolVersion: 1, type: 'manageResource', requestId: 'install-1',
      resourceId: 'qwen3-asr-1.7b-hf', action: 'install'
    }))).toMatchObject({ type: 'manageResource', action: 'install' })

    expect(parseEventLine(JSON.stringify({
      protocolVersion: 1, type: 'resourceChanged', requestId: 'resource-1',
      resource: {
        resourceId: 'qwen3-asr-1.7b-hf', kind: 'recognitionModel', provider: 'qwen3-asr',
        name: 'Qwen3-ASR 1.7B', description: '本地流式识别模型', languages: ['zh', 'en'],
        installed: false, installedBytes: 0, downloadBytes: 458187351,
        state: 'running', phase: 'download', progress: 0.5, cancellable: true
      }
    }))).toMatchObject({ type: 'resourceChanged', resource: { progress: 0.5 } })
  })

  it('校验本地翻译模型资源记录的枚举', () => {    expect(parseEventLine(JSON.stringify({
      protocolVersion: 1, type: 'resourceChanged', requestId: 'resource-2',
      resource: {
        resourceId: 'hy-mt2-1.8b-q4-k-m', kind: 'translationModel', provider: 'hymt2',
        name: 'Hy-MT2 1.8B Q4_K_M', description: '本地翻译模型', languages: ['zh', 'en'],
        installed: true, installedBytes: 1130000000,
        state: 'idle', cancellable: false
      }
    }))).toMatchObject({ type: 'resourceChanged', resource: { kind: 'translationModel', provider: 'hymt2' } })
  })

  it('接受三档 Hy-MT2 量化并拒绝未知档位', () => {
    for (const id of ['hy-mt2-1.8b-q4-k-m', 'hy-mt2-1.8b-q3-k-m', 'hy-mt2-1.8b-iq2-m']) {
      expect(parseCommandLine(JSON.stringify({
        protocolVersion: 1, type: 'startSession', requestId: `start-${id}`,
        config: {
          audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime',
          sourceLanguage: 'auto', targetLanguages: ['en'],
          translationProvider: 'hymt2', translationModelId: id,
        }
      }))).toMatchObject({ type: 'startSession', config: { translationModelId: id } })
    }
    expect(() => parseCommandLine(JSON.stringify({
      protocolVersion: 1, type: 'startSession', requestId: 'start-bad',
      config: {
        audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime',
        sourceLanguage: 'auto', targetLanguages: ['en'],
        translationProvider: 'hymt2', translationModelId: 'hy-mt2-1.8b-1.25bit',
      }
    }))).toThrow()
  })

  it('接受 SenseVoiceSmall 作为识别模型并拒绝已移除的 argos 翻译提供方', () => {
    expect(parseCommandLine(JSON.stringify({
      protocolVersion: 1, type: 'startSession', requestId: 'start-sensevoice',
      config: {
        audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime',
        recognitionModelId: 'sensevoice-small', sourceLanguage: 'auto', targetLanguages: ['zh'],
      }
    }))).toMatchObject({ type: 'startSession', config: { recognitionModelId: 'sensevoice-small' } })
    expect(() => parseCommandLine(JSON.stringify({
      protocolVersion: 1, type: 'startSession', requestId: 'start-1',
      config: {
        audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime',
        recognitionModelId: 'sherpa-zh-en-small', sourceLanguage: 'auto', targetLanguages: ['zh'],
      }
    }))).toThrow()
    expect(() => parseCommandLine(JSON.stringify({
      protocolVersion: 1, type: 'startSession', requestId: 'start-2',
      config: {
        audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime',
        sourceLanguage: 'auto', targetLanguages: ['zh'], translationProvider: 'argos',
      }
    }))).toThrow()
  })
})
