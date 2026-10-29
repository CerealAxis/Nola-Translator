import { z } from 'zod'
import { normalizeModelBinding, type GatewayCapability } from './model-gateway'
import type { AppSettings, AppSettingsPatch } from './settings'

export interface ModelPolicy {
  enabled: Record<string, boolean>
  defaults: Partial<Record<GatewayCapability, string>>
  selections: Partial<Record<GatewayCapability, string>>
}

export const MODEL_CAPABILITIES: readonly GatewayCapability[] = ['asr', 'mt', 'tts', 'llm']
const capabilityBindings = z.object({ asr: z.string().max(512), mt: z.string().max(512), tts: z.string().max(512), llm: z.string().max(512) }).partial()
export const modelPolicySchema = z.object({
  enabled: z.record(z.string().max(520), z.boolean()),
  defaults: capabilityBindings,
  selections: capabilityBindings,
})

export function modelPolicyKey(kind: GatewayCapability, binding: string): string {
  const normalized = normalizeModelBinding(kind, binding)
  return normalized ? `${kind}:${normalized}` : ''
}

function legacySceneBinding(settings: AppSettings, kind: GatewayCapability): string {
  if (kind === 'llm') return normalizeModelBinding(kind, settings.modelGateway.llmModel)
  if (kind === 'tts') return normalizeModelBinding(kind, settings.synthesis.modelId)
  if (kind === 'asr') return settings.recognition.provider && settings.recognition.provider !== 'local'
    ? `cloud:${settings.recognition.provider}` : normalizeModelBinding(kind, settings.recognition.modelId)
  const translation = settings.translation
  if (translation.provider === 'local') return normalizeModelBinding(kind, translation.localModelId)
  if (translation.provider === 'cloud') return `mt-custom:${translation.customModelId || 'legacy'}`
  return normalizeModelBinding(kind, `cloud:${translation.provider}`)
}

/** Legacy profiles seed only models they actually selected or bound, never every configured API. */
export function modelPolicyOf(settings: AppSettings): ModelPolicy {
  const stored = settings.modelPolicy
  const policy: ModelPolicy = { enabled: {}, defaults: {}, selections: {} }
  if (stored) {
    for (const kind of MODEL_CAPABILITIES) {
      for (const field of ['defaults', 'selections'] as const) {
        const binding = normalizeModelBinding(kind, stored[field]?.[kind])
        if (binding) policy[field][kind] = binding
      }
    }
    for (const [key, enabled] of Object.entries(stored.enabled ?? {})) {
      const separator = key.indexOf(':')
      const kind = key.slice(0, separator) as GatewayCapability
      if (!MODEL_CAPABILITIES.includes(kind) || typeof enabled !== 'boolean') continue
      const canonical = modelPolicyKey(kind, key.slice(separator + 1))
      if (canonical) policy.enabled[canonical] = enabled
    }
    return policy
  }
  for (const kind of MODEL_CAPABILITIES) {
    const selection = legacySceneBinding(settings, kind)
    const gateway = normalizeModelBinding(kind, settings.modelGateway[`${kind}Model`])
    if (selection) {
      policy.selections[kind] = selection
      policy.enabled[modelPolicyKey(kind, selection)] = true
    }
    const binding = gateway || selection
    if (binding) {
      policy.defaults[kind] = binding
      policy.enabled[modelPolicyKey(kind, binding)] = true
    }
  }
  const fallback = settings.translation.fallback.provider
  const backup = normalizeModelBinding('mt', settings.modelGateway.mtFallbackModel)
  if (backup) policy.enabled[modelPolicyKey('mt', backup)] = true
  if (fallback !== 'disabled') {
    const binding = fallback === 'local' ? normalizeModelBinding('mt', settings.translation.localModelId)
      : fallback === 'cloud' ? 'mt-custom:legacy-fallback' : normalizeModelBinding('mt', `cloud:${fallback}`)
    if (binding) policy.enabled[modelPolicyKey('mt', binding)] = true
  }
  return policy
}

export function isModelEnabled(settings: AppSettings, kind: GatewayCapability, binding: string): boolean {
  const key = modelPolicyKey(kind, binding)
  return !!key && modelPolicyOf(settings).enabled[key] === true
}

export function defaultModelBinding(settings: AppSettings, kind: GatewayCapability): string {
  return modelPolicyOf(settings).defaults[kind] ?? ''
}

export function sceneModelBinding(settings: AppSettings, kind: GatewayCapability): string {
  const policy = modelPolicyOf(settings)
  return policy.selections[kind] ?? policy.defaults[kind] ?? ''
}

export function modelEnablePatch(settings: AppSettings, kind: GatewayCapability, binding: string, enabled: boolean): AppSettingsPatch {
  const key = modelPolicyKey(kind, binding)
  if (!key) return {}
  const policy = settings.modelPolicy ? { enabled: {}, defaults: {}, selections: {} } : modelPolicyOf(settings)
  return { modelPolicy: { ...policy, enabled: { ...policy.enabled, [key]: enabled } } }
}

/** Setting a default explicitly enables that model without changing any scene selection. */
export function defaultModelPatch(settings: AppSettings, kind: GatewayCapability, binding: string): AppSettingsPatch {
  const normalized = normalizeModelBinding(kind, binding)
  if (!normalized) return {}
  const policy = settings.modelPolicy ? { enabled: {}, defaults: {}, selections: {} } : modelPolicyOf(settings)
  return { modelPolicy: { ...policy, enabled: { ...policy.enabled, [modelPolicyKey(kind, normalized)]: true }, defaults: { ...policy.defaults, [kind]: normalized } } }
}

export function sceneModelPatch(settings: AppSettings, kind: GatewayCapability, binding: string): AppSettingsPatch {
  const normalized = normalizeModelBinding(kind, binding)
  if (!normalized) return {}
  const policy = settings.modelPolicy ? { enabled: {}, defaults: {}, selections: {} } : modelPolicyOf(settings)
  return { modelPolicy: { ...policy, selections: { ...policy.selections, [kind]: normalized } } }
}

/** Policy updates merge individual entries so concurrent scene selections cannot undo each other. */
export function mergeModelPolicy(settings: AppSettings, patch?: ModelPolicy): ModelPolicy {
  const current = modelPolicyOf(settings)
  return { enabled: { ...current.enabled, ...patch?.enabled }, defaults: { ...current.defaults, ...patch?.defaults }, selections: { ...current.selections, ...patch?.selections } }
}
