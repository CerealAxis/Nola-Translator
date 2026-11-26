import { randomUUID } from 'node:crypto'
import { TtsCompatibilityError } from '../../shared/tts/errors'
import type { TtsVoiceRef } from '../../shared/tts/voice-ref'
import type { TtsUsage } from '../../shared/tts/voice-library-api'
import type { DirectModelRequest, DirectModelResult } from '../../shared/agent-workspace'
import type { TtsSynthesisRequest } from '../../shared/tts/synthesis'
import { resolveTtsRequest, type TtsResolutionContext } from './tts-request-resolver'
import type { VoiceLibrary } from './voice-library'
import type { VoiceAssets } from './voice-assets'
import type { TtsAdapter } from './adapters/tts-adapter'
import { DirectModelTtsAdapter } from './adapters/direct-model-adapter'

export class TtsOrchestrator {
  constructor(private readonly context: TtsResolutionContext | ((binding: string) => Promise<TtsResolutionContext>), private readonly library: VoiceLibrary,
    private readonly assets: VoiceAssets) {}

  async resolve(request: TtsSynthesisRequest, usage: TtsUsage = 'synthesis') {
    return this.resolveForUsage(request, typeof this.context === 'function' ? await this.context(request.modelBinding) : this.context, usage)
  }

  private async resolveForUsage(request: TtsSynthesisRequest, context: TtsResolutionContext, usage: TtsUsage) {
    const resolved = await resolveTtsRequest(request, context)
    if (usage === 'realtime' && resolved.conditioning.kind === 'design')
      throw new TtsCompatibilityError('VOICE_PREPARATION_REQUIRED', { reason: 'realtime-design-sample-required' })
    return resolved
  }

  async compatibility(modelBinding: string, targetLanguage: string, refs: TtsVoiceRef[], usage: TtsUsage = 'synthesis') {
    const context = typeof this.context === 'function' ? await this.context(modelBinding) : this.context
    const capabilities = await context.capabilities(modelBinding)
    const batchContext = { ...context, capabilities: async () => capabilities }
    return Promise.all(refs.map(async ref => {
      try {
        await this.resolveForUsage({ schemaVersion: 1, requestId: randomUUID(), modelBinding, voiceRef: ref, text: 'preview', targetLanguage }, batchContext, usage)
        return { ref, compatible: true }
      } catch (error) {
        if (!(error instanceof TtsCompatibilityError)) throw error
        return { ref, compatible: false, code: error.code, details: error.details }
      }
    }))
  }

  async inventory(binding: string) {
    const context = typeof this.context === 'function' ? await this.context(binding) : this.context
    return (await context.capabilities(binding)).presetVoices
  }

  adapter(execute: (request: DirectModelRequest, signal: AbortSignal) => Promise<DirectModelResult>): TtsAdapter {
    return new DirectModelTtsAdapter({ execute, capabilities: async binding => {
      const context = typeof this.context === 'function' ? await this.context(binding) : this.context
      return context.capabilities(binding)
    }, reference: async id => {
      const asset = this.library.asset(id)
      return `data:${asset.mime};base64,${(await this.assets.read(asset)).toString('base64')}`
    } })
  }

  async synthesize(request: TtsSynthesisRequest, signal: AbortSignal,
    adapter: TtsAdapter): Promise<DirectModelResult> {
    signal.throwIfAborted()
    const resolved = await this.resolve(request)
    signal.throwIfAborted()
    const generationId = this.library.enqueue(resolved)
    try {
      const result = await adapter.synthesize(resolved, signal)
      signal.throwIfAborted()
      if (!result.audio) throw new Error('ttsNoAudio')
      const match = /^data:audio\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/]+={0,2})$/i.exec(result.audio)
      if (!match) throw new Error('ttsInvalidAudio')
      const asset = await this.assets.write(generationId, 'output', Buffer.from(match[1], 'base64'))
      this.library.addAsset(asset)
      if (resolved.conditioning.kind === 'design' && resolved.profileId && resolved.profileRevision) {
        this.library.lockSample(resolved.profileId, resolved.profileRevision, asset.id, resolved.text)
      }
      this.library.finish(generationId, 'complete', asset.id)
      this.library.activateBinding(resolved)
      return { text: resolved.text, audio: result.audio }
    } catch (error) {
      this.library.finish(generationId, signal.aborted ? 'cancelled' : 'failed', undefined,
        error instanceof Error ? error.message : 'ttsFailed')
      throw error
    }
  }
}
