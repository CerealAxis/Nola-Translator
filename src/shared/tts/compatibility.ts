import type { TtsModelCapabilities, TtsPresetVoiceDescriptor } from './capabilities'

export type TtsCompatibilityStatus = 'compatible' | 'incompatible' | 'unverified'

export function ttsProviderLanguage(providerId: string, targetLanguage: string): string {
  return providerId === 'azure-tts' && normalizeTtsLanguage(targetLanguage).split('-')[0] === 'yue' ? 'zh-HK' : targetLanguage
}

export function ttsVoiceLanguages(provider: string, locale: string): string[] {
  return [(provider === 'edge-tts' || provider === 'azure-tts') && locale === 'zh-HK' ? 'yue-HK' : locale]
}

export function normalizeTtsLanguage(value: string): string {
  const raw = value.trim().replaceAll('_', '-')
  if (raw === 'auto') return raw
  const aliases: Record<string, string> = { cn: 'zh-CN', jp: 'ja', kr: 'ko', 'zh-chs': 'zh-CN', 'zh-cht': 'zh-TW' }
  return Intl.getCanonicalLocales(aliases[raw.toLowerCase()] ?? raw)[0]
}

export function ttsLanguageMatches(supported: string, target: string): boolean {
  const a = normalizeTtsLanguage(supported), b = normalizeTtsLanguage(target)
  if (a === b) return true
  if (a === 'zh-HK' || b === 'zh-HK') return false
  const source = new Intl.Locale(a), output = new Intl.Locale(b)
  if (source.language !== output.language) return false
  const sourceScript = source.script || (source.language === 'zh' && source.region ? source.maximize().script : undefined)
  const targetScript = output.script || (output.language === 'zh' && output.region ? output.maximize().script : undefined)
  if (sourceScript && targetScript && sourceScript !== targetScript) return false
  return !source.region || !output.region || source.region === output.region
}

export function intersectTtsLanguages(provider: string[], selection: string[]): string[] {
  return [...new Set(provider.flatMap(supported => selection.filter(target => ttsLanguageMatches(supported, target)).map(target => {
    const source = new Intl.Locale(normalizeTtsLanguage(supported)), output = new Intl.Locale(normalizeTtsLanguage(target))
    return new Intl.Locale(source.language, { script: source.script || output.script, region: source.region || output.region }).toString()
  })))]
}

export function ttsLanguageCompatibility(capabilities: TtsModelCapabilities, language: string,
  voice?: TtsPresetVoiceDescriptor): TtsCompatibilityStatus {
  const target = normalizeTtsLanguage(language)
  if (target === 'auto') return capabilities.languageInputMode !== 'auto-detect' ? 'incompatible'
    : capabilities.languages.mode === 'unknown' ? 'unverified' : 'compatible'
  const model = capabilities.languages
  if (model.mode === 'finite' && !model.values.some(value => ttsLanguageMatches(value, target))) return 'incompatible'
  if (voice?.languages && !voice.languages.some(value => ttsLanguageMatches(value, target))) return 'incompatible'
  return model.mode === 'finite' || model.mode === 'multi' && model.verifiedValues?.some(value => ttsLanguageMatches(value, target)) ? 'compatible' : 'unverified'
}
