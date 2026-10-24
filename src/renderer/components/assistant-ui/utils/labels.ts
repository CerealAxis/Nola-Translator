import { translate, useI18n, type TranslationVars } from '@/i18n'
import type { localCallZh } from '@/i18n/local-call-ui'
import { resolveUiLanguage } from '@/i18n'

export type AssistantLabelKey = keyof typeof localCallZh

/** Pure formatting helpers also need labels outside a React component. */
export function assistantText(key: AssistantLabelKey, values?: TranslationVars): string {
  return translate(`localCall.${key}`, resolveUiLanguage('auto', typeof document === 'undefined' ? 'en' : document.documentElement.lang), values)
}

export function useAssistantText() {
  const { t } = useI18n()
  return (key: AssistantLabelKey, values?: TranslationVars) => t(`localCall.${key}`, values)
}
