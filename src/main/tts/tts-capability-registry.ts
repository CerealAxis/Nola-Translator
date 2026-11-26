import type { WorkspaceConnection } from '../../shared/model-workspace'
import { ttsCatalogCapabilities } from '../../shared/tts/catalog'
import type { TtsModelCapabilities, TtsPresetVoiceDescriptor } from '../../shared/tts/capabilities'
import { ttsVoiceLanguages } from '../../shared/tts/compatibility'
import { astrBotSpeechPreset } from '../../shared/astrbot-speech-presets'

interface CacheEntry { expires: number; value: TtsModelCapabilities }
export class TtsCapabilityRegistry {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly pending = new Map<string, Promise<TtsModelCapabilities>>()

  async capabilities(connection: WorkspaceConnection, modelId: string, binding: string,
    credential: string, credentialRevision: string, signal: AbortSignal, refresh = false, cachedOnly = false): Promise<TtsModelCapabilities> {
    const scope = JSON.stringify([connection.id, connection.endpoint, connection.options?.region ?? connection.region,
      connection.options?.groupId, connection.workspace, modelId, binding, credentialRevision])
    const cached = this.cache.get(scope)
    if (!refresh && cached && cached.expires > Date.now()) return structuredClone(cached.value)
    if (cachedOnly) return ttsCatalogCapabilities(connection.service, modelId, binding)
    const pending = this.pending.get(scope)
    if (pending) return structuredClone(await pending)
    const query = this.query(connection, modelId, binding, credential, signal)
    this.pending.set(scope, query)
    try {
      const value = await query
      this.cache.set(scope, { expires: Date.now() + 15 * 60_000, value })
      return structuredClone(value)
    } finally { this.pending.delete(scope) }
  }

  private async query(connection: WorkspaceConnection, modelId: string, binding: string,
    credential: string, signal: AbortSignal): Promise<TtsModelCapabilities> {
    const catalog = ttsCatalogCapabilities(connection.service, modelId, binding)
    let voices: TtsPresetVoiceDescriptor[] | undefined
    if (connection.service === 'azure-tts') {
      const region = connection.options?.region || astrBotSpeechPreset('azure-tts')?.fields?.region || connection.region
      if (!/^[a-z0-9-]+$/i.test(region)) throw new Error('Invalid Azure region')
      const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, {
        headers: { 'Ocp-Apim-Subscription-Key': credential }, signal,
      })
      if (!response.ok) throw new Error(`Voice inventory HTTP ${response.status}`)
      const body = await response.json() as Array<{ ShortName: string; DisplayName: string; Locale: string;
        SecondaryLocaleList?: string[]; StyleList?: string[] }>
      voices = body.map(voice => ({ id: voice.ShortName, name: voice.DisplayName, locale: voice.Locale,
        languages: [voice.Locale, ...voice.SecondaryLocaleList ?? []].flatMap(locale => ttsVoiceLanguages(connection.service, locale)), styles: voice.StyleList }))
    } else if (connection.service === 'edge-tts') {
      const { MsEdgeTTS } = await import('msedge-tts')
      const client = new MsEdgeTTS()
      try {
        const inventory = await client.getVoices()
        voices = inventory.map(voice => ({ id: voice.ShortName, name: voice.FriendlyName, locale: voice.Locale, languages: ttsVoiceLanguages(connection.service, voice.Locale) }))
      } finally { client.close() }
    } else if (connection.service === 'elevenlabs-tts') {
      const base = connection.endpoint.replace(/\/+$/, '') || 'https://api.elevenlabs.io/v1'
      const headers = { 'xi-api-key': credential }
      const [modelResponse, voiceResponse] = await Promise.all([
        fetch(`${base}/models`, { headers, signal }), fetch(`${base.replace(/\/v1$/, '')}/v2/voices?page_size=100`, { headers, signal }),
      ])
      if (!modelResponse.ok || !voiceResponse.ok) throw new Error(`Voice inventory HTTP ${!modelResponse.ok ? modelResponse.status : voiceResponse.status}`)
      const models = await modelResponse.json() as Array<{ model_id: string; can_do_text_to_speech?: boolean; languages: Array<{ language_id: string }> }>
      const model = models.find(item => item.model_id === modelId)
      if (!model || model.can_do_text_to_speech === false) throw new Error('voiceModelMissing')
      type Inventory = { voices: Array<{ voice_id: string; name: string; category?: string }>; has_more?: boolean; next_page_token?: string }
      let inventory = await voiceResponse.json() as Inventory
      const collected = [...inventory.voices], pages = new Set<string>()
      while (inventory.has_more) {
        const token = inventory.next_page_token
        if (!token || pages.has(token)) throw new Error('voiceInventoryPaginationInvalid')
        pages.add(token)
        const page = await fetch(`${base.replace(/\/v1$/, '')}/v2/voices?page_size=100&next_page_token=${encodeURIComponent(token)}`, { headers, signal })
        if (!page.ok) throw new Error(`Voice inventory HTTP ${page.status}`)
        inventory = await page.json() as Inventory
        collected.push(...inventory.voices)
      }
      return { ...catalog, languages: { mode: 'finite', values: model.languages.map(item => item.language_id) },
        conditioning: ['preset', 'provider-voice'], supports: { ...catalog.supports, cloning: true, voiceDesign: true },
        presetVoices: collected.filter(item => item.category === 'premade' || item.category === 'default')
          .map(item => ({ id: item.voice_id, name: item.name })), source: 'provider-api', revision: new Date().toISOString() }
    } else if (connection.service === 'minimax-tts') {
      const configured = new URL(connection.endpoint || 'https://api.minimax.io/v1/t2a_v2')
      const url = new URL('/v1/get_voice', configured)
      const response = await fetch(url, { method: 'POST', signal, headers: { Authorization: `Bearer ${credential}`,
        'Content-Type': 'application/json' }, body: JSON.stringify({ voice_type: 'system' }) })
      if (!response.ok) throw new Error(`Voice inventory HTTP ${response.status}`)
      const inventory = await response.json() as { base_resp?: { status_code: number }; system_voice?: Array<{ voice_id: string; voice_name?: string }> }
      if (inventory.base_resp?.status_code) throw new Error(`Voice inventory ${inventory.base_resp.status_code}`)
      voices = (inventory.system_voice ?? []).map(item => ({ id: item.voice_id, name: item.voice_name || item.voice_id }))
    }
    return voices ? { ...catalog, presetVoices: voices, languages: voices.some(voice => voice.languages)
      ? { mode: 'finite', values: [...new Set(voices.flatMap(voice => voice.languages ?? []))] } : catalog.languages,
      source: 'provider-api', revision: new Date().toISOString() } : catalog
  }
}
