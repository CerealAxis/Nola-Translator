import { z } from 'zod'
import type { WorkspaceConnection } from '../../../shared/model-workspace'
import type { TtsVoiceProfile } from '../../../shared/tts/voice-profile'
import type { VoiceAsset } from '../voice-assets'
import { validateDesignRecipe } from '../../../shared/tts/design-recipe'
import { dashscopeVoiceApiModel } from './dashscope-voice-family'

export interface ProviderVoiceInput {
  profile: TtsVoiceProfile;
  modelId: string;
  voiceId: string;
  previewText: string;
  language: string;
  reference?: { asset: VoiceAsset; data: Buffer; transcript?: string };
}
export interface ProviderVoiceResult {
  voiceId: string;
  status: 'ready' | 'processing' | 'failed';
  sample?: Buffer;
  activationDeadline?: string;
}

export class ProviderVoiceError extends Error {
  constructor(readonly code: string, readonly status?: number) { super(code) }
}

export class ProviderVoiceAdapter {
  private readonly base: string
  constructor(private readonly connection: WorkspaceConnection, private readonly key: string,
    private readonly signal: AbortSignal) {
    const defaults: Record<string, string> = { 'minimax-tts': 'https://api.minimax.io',
      'elevenlabs-tts': 'https://api.elevenlabs.io', 'fishaudio-tts': 'https://api.fish.audio',
      'dashscope-tts': 'https://dashscope.aliyuncs.com' }
    const endpoint = connection.endpoint || defaults[connection.service]
    if (!endpoint) throw new ProviderVoiceError('voicePreparationUnsupported')
    const url = new URL(endpoint)
    if (!['https:', 'wss:'].includes(url.protocol)) throw new ProviderVoiceError('voiceEndpointInvalid')
    this.base = url.origin.replace(/^wss:/, 'https:')
  }

  private async call(path: string, body?: unknown, method = 'POST'): Promise<unknown> {
    const form = body instanceof FormData
    const response = await fetch(this.base + path, { method, signal: this.signal, redirect: 'error',
      headers: { ...(this.connection.service === 'elevenlabs-tts' ? { 'xi-api-key': this.key } : { Authorization: `Bearer ${this.key}` }),
        ...(!form && body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body) })
    if (!response.ok) throw new ProviderVoiceError(response.status === 401 ? 'authentication_failed'
      : response.status === 402 ? 'quota_exceeded' : response.status === 403 ? 'permission_or_region_denied'
      : response.status === 404 ? 'voice_or_scope_missing' : response.status === 429 ? 'rate_limited' : 'provider_failed', response.status)
    if (response.status === 204 || method === 'DELETE') return undefined
    const raw: unknown = await response.json()
    const error = z.object({ base_resp: z.object({ status_code: z.number() }).optional(), code: z.string().optional() }).passthrough().parse(raw)
    if (error.base_resp?.status_code) throw new ProviderVoiceError(`provider_${error.base_resp.status_code}`)
    if (error.code) throw new ProviderVoiceError(error.code)
    return raw
  }

  async create(input: ProviderVoiceInput): Promise<ProviderVoiceResult> {
    const design = input.profile.representations.find(item => item.kind === 'design-recipe')
    if (design && !validateDesignRecipe(design.recipeSchema ?? 'nola-description-v1', design.recipe, this.connection.service)) throw new ProviderVoiceError('voiceRecipeUnsupported')
    if (design?.seed !== undefined && !['elevenlabs-tts', 'fishaudio-tts'].includes(this.connection.service)) throw new ProviderVoiceError('voiceSeedUnsupported')
    const reference = input.reference
    if (input.profile.kind !== 'design' && !reference) throw new ProviderVoiceError('voiceReferenceRequired')
    switch (this.connection.service) {
      case 'minimax-tts': {
        if (design) {
          const result = z.object({ voice_id: z.string(), trial_audio: z.string().optional() }).parse(await this.call('/v1/voice_design', {
            prompt: design.description, preview_text: input.previewText,
          }))
          return { voiceId: result.voice_id, status: 'ready', sample: result.trial_audio ? Buffer.from(result.trial_audio, 'hex') : undefined,
            activationDeadline: new Date(Date.now() + 168 * 3600_000).toISOString() }
        }
        if (!reference || reference.asset.bytes > 20_000_000 || reference.asset.durationMs === undefined
          || reference.asset.durationMs < 10_000 || reference.asset.durationMs > 300_000) throw new ProviderVoiceError('voiceReferenceInvalid')
        const form = new FormData()
        form.set('purpose', 'voice_clone')
        form.set('file', new Blob([new Uint8Array(reference.data)], { type: reference.asset.mime }), 'reference.' + (reference.asset.mime === 'audio/wav' ? 'wav' : 'mp3'))
        const uploaded = z.object({ file: z.object({ file_id: z.union([z.string(), z.number()]) }) }).parse(await this.call('/v1/files/upload', form))
        await this.call('/v1/voice_clone', { file_id: uploaded.file.file_id, voice_id: input.voiceId })
        return { voiceId: input.voiceId, status: 'ready', activationDeadline: new Date(Date.now() + 168 * 3600_000).toISOString() }
      }
      case 'elevenlabs-tts': {
        if (design) {
          const previews = z.object({ previews: z.array(z.object({ generated_voice_id: z.string(), audio_base_64: z.string() })).min(1) })
            .parse(await this.call('/v1/text-to-voice/design', { voice_description: design.description,
              text: input.previewText, model_id: 'eleven_multilingual_ttv_v2', ...(design.seed !== undefined ? { seed: design.seed } : {}) }))
          const selected = previews.previews[0]
          const result = z.object({ voice_id: z.string() }).parse(await this.call('/v1/text-to-voice', {
            voice_name: input.profile.name, voice_description: design.description, generated_voice_id: selected.generated_voice_id,
          }))
          return { voiceId: result.voice_id, status: 'ready', sample: Buffer.from(selected.audio_base_64, 'base64') }
        }
        const form = new FormData()
        form.set('name', input.profile.name)
        form.append('files', new Blob([new Uint8Array(reference!.data)], { type: reference!.asset.mime }), 'reference.' + (reference!.asset.mime === 'audio/wav' ? 'wav' : 'mp3'))
        const result = z.object({ voice_id: z.string(), requires_verification: z.boolean().optional() }).parse(await this.call('/v1/voices/add', form))
        return { voiceId: result.voice_id, status: result.requires_verification ? 'processing' : 'ready' }
      }
      case 'dashscope-tts': {
        const family = dashscopeVoiceApiModel(input.modelId, design ? 'design' : 'clone')
        const legacy = family !== 'voice-enrollment'
        const inputBody: Record<string, unknown> = { action: legacy ? 'create' : 'create_voice', target_model: input.modelId,
          ...(legacy ? { preferred_name: 'nola' } : { prefix: 'nola' }),
          ...(input.language === 'auto' || legacy ? {} : { language_hints: [input.language.split('-')[0]] }) }
        if (design) {
          if (design.description.length > 500 || input.previewText.length < 15 || input.previewText.length > 200) throw new ProviderVoiceError('voiceDesignInputInvalid')
          inputBody.voice_prompt = design.description; inputBody.preview_text = input.previewText
        } else {
          if (!reference || reference.asset.bytes > 10_000_000 || reference.asset.durationMs === undefined || reference.asset.durationMs > 60_000) throw new ProviderVoiceError('voiceReferenceInvalid')
          const data = `data:${reference.asset.mime};base64,${reference.data.toString('base64')}`
          inputBody.audio = legacy ? { data } : data
        }
        const result = z.object({ output: z.object({ voice_id: z.string().optional(), voice: z.string().optional(), preview_audio: z.object({ data: z.string() }).optional() }) })
          .parse(await this.call('/api/v1/services/audio/tts/customization', { model: family, input: inputBody,
            ...(design ? { parameters: { sample_rate: 24000, response_format: 'wav' } } : {}) }))
        const voiceId = legacy ? result.output.voice : result.output.voice_id
        if (!voiceId) throw new ProviderVoiceError('voiceCreationResponseInvalid')
        return { voiceId, status: legacy ? 'ready' : 'processing', sample: result.output.preview_audio
          ? Buffer.from(result.output.preview_audio.data, 'base64') : undefined }
      }
      case 'fishaudio-tts': {
        let data = reference?.data, transcript = reference?.transcript
        let sample: Buffer | undefined
        if (design) {
          if (design.description.length > 2000 || input.previewText.length > 150) throw new ProviderVoiceError('voiceDesignInputInvalid')
          const response = await fetch(this.base + '/v1/voice-design', { method: 'POST', signal: this.signal, redirect: 'error',
            headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', model: 'voice-design-1' },
            body: JSON.stringify({ instruction: design.description, reference_text: input.previewText,
              ...(input.language === 'auto' ? {} : { language: input.language.split('-')[0] }), n: 1,
              ...(design.recipeSchema === 'fish-voice-design-v1' ? design.recipe : {}),
              ...(design.seed !== undefined ? { seed: design.seed } : {}) }) })
          if (!response.ok) throw new ProviderVoiceError('voiceDesignFailed', response.status)
          const result = z.object({ candidates: z.array(z.object({ audio_base64: z.string() })).min(1) }).parse(await response.json())
          sample = data = Buffer.from(result.candidates[0].audio_base64, 'base64'); transcript = input.previewText
        }
        if (!data) throw new ProviderVoiceError('voiceReferenceRequired')
        const form = new FormData()
        form.set('type', 'tts'); form.set('title', input.profile.name); form.set('visibility', 'private'); form.set('train_mode', 'fast')
        form.append('voices', new Blob([new Uint8Array(data)], { type: design ? 'audio/wav' : reference!.asset.mime }), 'reference.' + (design || reference!.asset.mime === 'audio/wav' ? 'wav' : 'mp3'))
        if (transcript) form.append('texts', transcript)
        const result = z.object({ _id: z.string(), state: z.string() }).parse(await this.call('/model', form))
        return { voiceId: result._id, status: result.state === 'trained' || result.state === 'ready' ? 'ready' : 'processing', sample }
      }
      default: throw new ProviderVoiceError('voicePreparationUnsupported')
    }
  }

  async inspect(voiceId: string, modelId?: string): Promise<'ready' | 'processing' | 'failed' | 'remote-missing'> {
    try {
      switch (this.connection.service) {
        case 'elevenlabs-tts': {
          const value = z.object({ voice_verification: z.object({ requires_verification: z.boolean().optional() }).nullish() })
            .parse(await this.call(`/v1/voices/${encodeURIComponent(voiceId)}`, undefined, 'GET'))
          return value.voice_verification?.requires_verification ? 'processing' : 'ready'
        }
        case 'fishaudio-tts': {
          const value = z.object({ state: z.string() }).parse(await this.call(`/model/${encodeURIComponent(voiceId)}`, undefined, 'GET'))
          return ['trained', 'ready'].includes(value.state) ? 'ready' : ['failed', 'error'].includes(value.state) ? 'failed' : 'processing'
        }
        case 'dashscope-tts': {
          const family = dashscopeVoiceApiModel(modelId ?? '', modelId?.includes('-vd-') ? 'design' : 'clone')
          const legacy = family !== 'voice-enrollment'
          const value = z.object({ output: z.object({ status: z.string().optional(), target_model: z.string().optional(), voice: z.string().optional() }) }).parse(await this.call('/api/v1/services/audio/tts/customization', {
            model: family, input: legacy ? { action: 'query', voice: voiceId } : { action: 'query_voice', voice_id: voiceId },
          }))
          if (modelId && value.output.target_model !== modelId) throw new ProviderVoiceError('voiceModelMismatch')
          if (legacy) return value.output.voice === voiceId ? 'ready' : 'remote-missing'
          return value.output.status === 'OK' ? 'ready' : value.output.status === 'UNDEPLOYED' ? 'failed' : 'processing'
        }
        case 'minimax-tts': {
          const value = z.object({ voice_cloning: z.array(z.object({ voice_id: z.string() })).optional(),
            voice_generation: z.array(z.object({ voice_id: z.string() })).optional() })
            .parse(await this.call('/v1/get_voice', { voice_type: 'all' }))
          return [...value.voice_cloning ?? [], ...value.voice_generation ?? []].some(item => item.voice_id === voiceId) ? 'ready' : 'remote-missing'
        }
        default: throw new ProviderVoiceError('voicePreparationUnsupported')
      }
    } catch (error) {
      if (error instanceof ProviderVoiceError && error.status === 404) return 'remote-missing'
      throw error
    }
  }

  async remove(voiceId: string, kind: TtsVoiceProfile['kind'], modelId?: string): Promise<void> {
    switch (this.connection.service) {
      case 'elevenlabs-tts': await this.call(`/v1/voices/${encodeURIComponent(voiceId)}`, undefined, 'DELETE'); return
      case 'fishaudio-tts': await this.call(`/model/${encodeURIComponent(voiceId)}`, undefined, 'DELETE'); return
      case 'minimax-tts': await this.call('/v1/delete_voice', { voice_type: kind === 'design' ? 'voice_generation' : 'voice_cloning', voice_id: voiceId }); return
      case 'dashscope-tts': {
        const family = dashscopeVoiceApiModel(modelId ?? '', kind)
        await this.call('/api/v1/services/audio/tts/customization', { model: family,
          input: family === 'voice-enrollment' ? { action: 'delete_voice', voice_id: voiceId } : { action: 'delete', voice: voiceId } }); return
      }
      default: throw new ProviderVoiceError('voicePreparationUnsupported')
    }
  }
}
