import { beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import { defaultAgentModel, nativeAgentTools, type AgentToolContext } from '../../../src/main/agent-tools'
import { runDirectModel } from '../../../src/main/direct-model'
import type { ToolSet } from 'ai'
import { defaultModelPatch, mergeModelPolicy, modelEnablePatch, sceneModelPatch } from '../../../src/shared/model-policy'

vi.mock('../../../src/main/direct-model', () => ({ runDirectModel: vi.fn() }))
let settings = structuredClone(DEFAULT_SETTINGS)
const artifact = vi.fn()
const prepareAudio = vi.fn()
const context: AgentToolContext = {
  services: { getSettings: () => settings, getCredential: async () => '' }, ownerId: 41,
  messages: [], signal: new AbortController().signal, model: 'fixture', maxOutputTokens: 1000,
  providerOptions: {}, approvedTerminalCallIds: new Set(), artifact, prepareAudio,
}
const options = { toolCallId: 'fixture', messages: [], abortSignal: context.signal }
async function executeTool(tools: ToolSet, name: string, input: object) {
  const execute = tools[name]?.execute
  if (!execute) throw new Error(`Missing tool: ${name}`)
  return Reflect.apply(execute, undefined, [input, options])
}
beforeEach(() => {
  vi.clearAllMocks()
  settings = structuredClone(DEFAULT_SETTINGS)
  settings.synthesis = { modelId: 'default-tts', voice: 'default-voice' }
  context.messages = []
  vi.mocked(runDirectModel).mockResolvedValue({ text: 'result', audio: 'data:audio/wav;base64,AA==' })
  prepareAudio.mockResolvedValue('data:audio/wav;base64,AA==')
})

it('uses the current defaults at execution time and ignores a model ID supplied by the language model', async () => {
  const tools = await nativeAgentTools(context)
  settings.translation.localModelId = 'new-default-mt'
  await executeTool(tools, 'translate_text', { model: 'resource:unselected', text: 'Hello', source: 'en', target: 'zh' })
  expect(runDirectModel).toHaveBeenLastCalledWith(context.services, expect.objectContaining({ model: 'resource:new-default-mt', kind: 'mt' }), context.signal, false, context.ownerId)
  await executeTool(tools, 'synthesize_speech', { model: 'resource:unselected', text: 'Hello', voice: '' })
  expect(runDirectModel).toHaveBeenLastCalledWith(context.services, expect.objectContaining({ model: 'resource:default-tts', voice: 'default-voice' }), context.signal, false, context.ownerId)
  expect(artifact).toHaveBeenCalledWith('data:audio/wav;base64,AA==')
})

it('honors cloud defaults independently of scene translation and rejects coupled-only providers', () => {
  settings.recognition.provider = 'minimax'
  expect(defaultAgentModel(context.services, 'asr')).toBe('cloud:minimax')
  settings.translation.provider = 'mymemory'
  expect(defaultAgentModel(context.services, 'mt')).toBe('cloud:mymemory')
  settings.translation.targetLanguage = 'none'
  expect(defaultAgentModel(context.services, 'mt')).toBe('cloud:mymemory')
  settings.translation.targetLanguage = 'zh'
  settings.translation.provider = 'recognition'
  expect(() => defaultAgentModel(context.services, 'mt')).toThrow('independent')
  settings.synthesis.modelId = ''
  expect(() => defaultAgentModel(context.services, 'tts')).toThrow('No default')
})

it('normalizes a video internally and transcribes it using the selected default ASR model', async () => {
  context.messages = [{ id: 'u', role: 'user', parts: [{ type: 'file', mediaType: 'video/webm', filename: 'original.webm', url: 'data:video/webm;base64,AA==' }] }]
  const tools = await nativeAgentTools(context)
  await executeTool(tools, 'recognize_audio', { attachment: 0, path: null, language: 'auto' })
  expect(prepareAudio).toHaveBeenCalledWith({ mimeType: 'video/webm', url: 'data:video/webm;base64,AA==' })
  expect(runDirectModel).toHaveBeenCalledWith(context.services, expect.objectContaining({ model: `resource:${settings.recognition.modelId}`, audio: 'data:audio/wav;base64,AA==' }), context.signal, false, context.ownerId)
  expect(context.messages[0].parts[0]).toMatchObject({ mediaType: 'video/webm', filename: 'original.webm' })
})

it('uses the explicit management default instead of the scene or gateway binding', () => {
  settings.modelPolicy = mergeModelPolicy(settings, defaultModelPatch(settings, 'mt', 'cloud:mymemory').modelPolicy)
  settings.modelPolicy = mergeModelPolicy(settings, sceneModelPatch(settings, 'mt', 'resource:scene-model').modelPolicy)
  settings.modelGateway.mtModel = 'resource:gateway-model'
  const services = { ...context.services, inferModel: vi.fn() }
  expect(defaultAgentModel(services, 'mt')).toBe('cloud:mymemory')
  settings.modelPolicy = mergeModelPolicy(settings, modelEnablePatch(settings, 'mt', 'cloud:mymemory', false).modelPolicy)
  expect(() => defaultAgentModel(services, 'mt')).toThrow('disabled')
})
