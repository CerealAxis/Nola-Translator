import { z } from 'zod'
import { LANGUAGE_CODES, normalizeLanguage } from './languages'
import type { ResourceRecord } from './contracts'

const language = z.string().refine(code => LANGUAGE_CODES.includes(normalizeLanguage(code)))
const languages = z.array(language).max(128)
export const modelConfigurationSchema = z.object({
  slot: z.enum(['recognition', 'translation']),
  engine: z.enum(['pytorch', 'llama']),
  languages,
  supportsAutoDetection: z.boolean(),
  sourceLanguages: languages,
  targetLanguages: languages,
  translationPairs: z.array(z.object({ source: language, target: language }).strict()).max(512).optional(),
}).strict().superRefine((value, context) => {
  const required = value.slot === 'recognition' ? [value.languages] : [value.sourceLanguages, value.targetLanguages]
  if (required.some(items => items.length === 0)) context.addIssue({ code: 'custom', message: 'missingLanguages' })
  if (value.translationPairs?.length === 0) context.addIssue({ code: 'custom', message: 'missingPairs' })
  if (value.translationPairs?.some(pair => !value.sourceLanguages.map(normalizeLanguage).includes(normalizeLanguage(pair.source)) || !value.targetLanguages.map(normalizeLanguage).includes(normalizeLanguage(pair.target)))) {
    context.addIssue({ code: 'custom', message: 'invalidPair' })
  }
})
export type ModelConfiguration = z.infer<typeof modelConfigurationSchema>
export const QWEN_LANGUAGES: readonly string[] = ["zh", "en", "yue", "ar", "de", "fr", "es", "pt", "id", "it", "ko", "ru", "th", "vi", "ja", "tr", "hi", "ms", "nl", "sv", "da", "fi", "pl", "cs", "tl", "fa", "el", "hu", "mk", "ro"]
export const HYMT2_LANGUAGES: readonly string[] = ["zh", "en", "fr", "pt", "es", "ja", "tr", "ru", "ar", "ko", "th", "it", "de", "vi", "ms", "id", "tl", "hi", "zh-Hant", "pl", "cs", "nl", "km", "my", "fa", "gu", "ur", "te", "mr", "he", "bn", "ta", "uk", "bo", "kk", "mn", "ug", "yue"]
export const M2M100_LANGUAGES: readonly string[] = ["af", "am", "ar", "ast", "az", "ba", "be", "bg", "bn", "br", "bs", "ca", "ceb", "cs", "cy", "da", "de", "el", "en", "es", "et", "fa", "ff", "fi", "fr", "fy", "ga", "gd", "gl", "gu", "ha", "he", "hi", "hr", "ht", "hu", "hy", "id", "ig", "ilo", "is", "it", "ja", "jv", "ka", "kk", "km", "kn", "ko", "lb", "lg", "ln", "lo", "lt", "lv", "mg", "mk", "ml", "mn", "mr", "ms", "my", "ne", "nl", "no", "ns", "oc", "or", "pa", "pl", "ps", "pt", "ro", "ru", "sd", "si", "sk", "sl", "so", "sq", "sr", "ss", "su", "sv", "sw", "ta", "th", "tl", "tn", "tr", "uk", "ur", "uz", "vi", "wo", "xh", "yi", "yo", "zh", "zu"]
const recognition = (codes: readonly string[]): ModelConfiguration => ({ slot: 'recognition', engine: 'pytorch', languages: [...codes], supportsAutoDetection: true, sourceLanguages: [], targetLanguages: [] })
const translation = (codes: readonly string[], engine: 'llama' | 'pytorch'): ModelConfiguration => ({ slot: 'translation', engine, languages: [], supportsAutoDetection: false, sourceLanguages: [...codes], targetLanguages: [...codes] })
export const RECOMMENDED_CONFIGURATIONS: Record<string, ModelConfiguration> = {
  'qwen3-asr-1.7b-hf': recognition(QWEN_LANGUAGES),
  'qwen3-asr-0.6b-hf': recognition(QWEN_LANGUAGES),
  'sensevoice-small': recognition(['zh', 'en', 'yue', 'ja', 'ko']),
  'hy-mt2-1.8b-q4-k-m': translation(HYMT2_LANGUAGES, 'llama'),
  'hy-mt2-1.8b-q3-k-m': translation(HYMT2_LANGUAGES, 'llama'),
  'hy-mt2-1.8b-iq2-m': translation(HYMT2_LANGUAGES, 'llama'),
  'm2m100-418m': translation(M2M100_LANGUAGES, 'pytorch'),
}
export function configurationOf(model: Pick<ResourceRecord, 'resourceId' | 'configuration'> | undefined): ModelConfiguration | undefined {
  return model?.configuration ?? (model ? RECOMMENDED_CONFIGURATIONS[model.resourceId] : undefined)
}
export function isModelReady(model: ResourceRecord): boolean { return model.installed && !!configurationOf(model) }
export function recognitionLanguages(model: ResourceRecord | undefined): string[] {
  const config = configurationOf(model)
  if (config?.slot !== 'recognition') return []
  return [...(config.supportsAutoDetection ? ['auto'] : []), ...new Set(config.languages.map(normalizeLanguage))]
}
export function supportsTranslation(model: ResourceRecord | undefined, source: string, target: string): boolean {
  if (target === 'none') return true
  const config = configurationOf(model)
  if (config?.slot !== 'translation') return false
  const from = normalizeLanguage(source), to = normalizeLanguage(target)
  if (!config.targetLanguages.map(normalizeLanguage).includes(to)) return false
  if (from === 'auto') return !config.translationPairs || config.translationPairs.some(pair => normalizeLanguage(pair.target) === to)
  if (!config.sourceLanguages.map(normalizeLanguage).includes(from)) return false
  return !config.translationPairs || config.translationPairs.some(pair => normalizeLanguage(pair.source) === from && normalizeLanguage(pair.target) === to)
}
export function translationLanguages(model: ResourceRecord | undefined, source: string): string[] {
  return ['none', ...new Set((configurationOf(model)?.targetLanguages ?? []).map(normalizeLanguage).filter(code => supportsTranslation(model, source, code)))]
}
