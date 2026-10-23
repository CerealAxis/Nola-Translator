import { z } from 'zod'
import { LANGUAGE_CODES } from './languages'
import { DEFAULT_SETTINGS, SOURCE_LANGUAGE_OPTIONS, type AppSettingsPatch, type CustomTranslationModel, type CredentialProvider, type TranslationSettings } from './settings'

export const customModelSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  name: z.string().trim().min(1).max(64),
  endpoint: z.string().max(2048).url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol)),
  model: z.string().trim().min(1).max(256),
  apiFormat: z.enum(['chat-completions', 'chat-responses', 'anthropic', 'ollama']),
  contextWindow: z.number().int().min(256).max(10_000_000),
  maxOutputTokens: z.number().int().min(1).max(10_000_000),
  languages: z.array(z.string().refine(code => LANGUAGE_CODES.includes(code))).min(1).max(LANGUAGE_CODES.length),
  sourceLanguages: z.array(z.string().refine(code => SOURCE_LANGUAGE_OPTIONS.includes(code))).min(1).max(SOURCE_LANGUAGE_OPTIONS.length).optional(),
}).strict()

export function customCredentialSlot(id: string): CredentialProvider {
  return id === 'legacy' ? 'cloud' : `cloud-model:${id}`
}

/** Legacy configurations keep their original encrypted credential slot until removed. */
export function customModelsOf(translation: TranslationSettings): CustomTranslationModel[] {
  if (translation.customModels !== undefined) return translation.customModels
  if (!translation.cloudName.trim() && translation.cloudEndpoint === DEFAULT_SETTINGS.translation.cloudEndpoint && translation.provider !== 'cloud') return []
  return [{ id: 'legacy', name: translation.cloudName.trim() || translation.cloudModel, endpoint: translation.cloudEndpoint,
    model: translation.cloudModel, apiFormat: translation.cloudApiFormat, contextWindow: translation.cloudContextWindow,
    maxOutputTokens: translation.cloudMaxOutputTokens, languages: translation.cloudLanguages ?? [...LANGUAGE_CODES],
    sourceLanguages: translation.cloudSourceLanguages ?? [...SOURCE_LANGUAGE_OPTIONS],
  }]
}

export function customModelPatch(translation: TranslationSettings, model: CustomTranslationModel): Partial<TranslationSettings> {
  return { provider: 'cloud', customModelId: model.id, cloudName: model.name, cloudEndpoint: model.endpoint,
    cloudModel: model.model, cloudApiFormat: model.apiFormat, cloudContextWindow: model.contextWindow,
    cloudMaxOutputTokens: model.maxOutputTokens, cloudLanguages: model.languages,
    cloudSourceLanguages: model.sourceLanguages ?? [...SOURCE_LANGUAGE_OPTIONS],
    targetLanguage: model.languages.includes(translation.targetLanguage) ? translation.targetLanguage : model.languages.includes('zh') ? 'zh' : model.languages[0],
  }
}

/** Keep the existing settings editor and named profiles on the same connection. */
export function synchronizeCustomModel(translation: TranslationSettings, patch: NonNullable<AppSettingsPatch['translation']> = {}): TranslationSettings {
  if (!translation.customModelId || !translation.customModels) return translation
  const model = translation.customModels.find(model => model.id === translation.customModelId)
  if (!model) return { ...translation, customModelId: '' }
  const fields = ['cloudName', 'cloudEndpoint', 'cloudModel', 'cloudApiFormat', 'cloudContextWindow', 'cloudMaxOutputTokens', 'cloudLanguages', 'cloudSourceLanguages'] as const
  if (patch.customModelId === undefined && patch.customModels === undefined && fields.some(field => patch[field] !== undefined)) {
    const updated: CustomTranslationModel = { ...model, name: translation.cloudName, endpoint: translation.cloudEndpoint,
      model: translation.cloudModel, apiFormat: translation.cloudApiFormat, contextWindow: translation.cloudContextWindow,
      maxOutputTokens: translation.cloudMaxOutputTokens, languages: translation.cloudLanguages ?? model.languages,
      sourceLanguages: translation.cloudSourceLanguages ?? model.sourceLanguages ?? [...SOURCE_LANGUAGE_OPTIONS] }
    const validated = customModelSchema.safeParse(updated)
    if (validated.success) return { ...translation, customModels: translation.customModels.map(item => item.id === model.id ? validated.data : item) }
  }
  const selected = customModelPatch(translation, model)
  return { ...translation, ...selected, provider: translation.provider,
    targetLanguage: translation.targetLanguage === 'none' || translation.provider !== 'cloud' ? translation.targetLanguage : selected.targetLanguage!,
  }
}
