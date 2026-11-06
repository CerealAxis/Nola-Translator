import { browserEn, browserZh } from './locale-base'
import { browserJa, browserKo, browserZhHK, browserZhTW } from './locale-regions'
import { resolveUiLanguage } from '../../src/shared/languages'
import type { UiLanguage, UiLanguagePreference } from '../../src/shared/languages'
import { extensionCopy, extensionLocales } from './extension-copy'
import { suiteLocales } from '../../src/renderer/i18n/translation-suite-ui'
type SharedBrowserKey = keyof typeof browserZh
type ExtensionKey = keyof typeof extensionCopy
type SuiteKey = `suite.${keyof typeof suiteLocales.en}`
export type BrowserKey = SharedBrowserKey | ExtensionKey | SuiteKey
/**
 * An unrecognised code remains in store diagnostics while the UI uses actionable fallback copy.
 */
export type BrowserTextKey = BrowserKey | `unknown:${string}`
const UNKNOWN_PREFIX = 'unknown:'
// Codes that are not dictionary keys of their own resolve to the closest existing message.
const ERROR_ALIASES: Record<string, BrowserKey> = {
  glossaryChanged: 'suite.glossaryChanged',
  glossaryPlaceholderFailed: 'suite.placeholderFailed',
  glossaryBudgetExceeded: 'suite.glossaryBudget',
  browserGlossaryUnsupported: 'updateRequired',
  nativePromptUnsupported: 'suite.nativePromptUnsupported',
  browserGlossaryModeUnsupported: 'suite.speechGlossaryUnsupported',
  sessionAlreadyRunning: 'busy',
  busy: 'busy',
  browserConnectionDisabled: 'appUnavailable',
  engineUpdateRequired: 'updateRequired',
  unsupportedProtocol: 'updateRequired',
  invalidMessage: 'updateRequired',
  audioBufferOverflow: 'slowAudio',
  lineTooLarge: 'internalError',
  browserConnectionUnavailable: 'appUnavailable',
  browserConnectionLost: 'connectionLost',
  browserPermissionDenied: 'permissionFailed',
  browserExtensionVersionMismatch: 'extensionVersionMismatch',
  browserProtocolMismatch: 'updateRequired',
  browserCaptureUnsupported: 'captureUnsupported',
  browserTabCapturePermission: 'chromiumCapture',
  browserCaptureTargetMismatch: 'wrongCapture',
  browserCaptureCancelled: 'captureCancelled',
  browserAudioSilent: 'tabAudioSilent',
  browserAudioBacklog: 'slowAudio',
  browserSessionAlreadyRunning: 'busy',
  browserSessionNotRunning: 'sessionNotRunning',
  browserCaptionServiceDisabled: 'captionServiceOff',
  browserIntegrationDisabled: 'appUnavailable',
  s2sConfigurationMissing: 'browserS2sUnavailable',
  translationTimeout: 'browserTranslationTimeout',
}
function isDictionaryKey(key: BrowserTextKey): key is BrowserKey {
  return !(key as string).startsWith(UNKNOWN_PREFIX)
}
export type BrowserUiLanguage = UiLanguagePreference

const dictionaries: Record<UiLanguage, Record<SharedBrowserKey, string>> = {
  'zh-CN': browserZh,
  'zh-TW': browserZhTW,
  'zh-HK': browserZhHK,
  ko: browserKo,
  ja: browserJa,
  en: browserEn,
}

export function browserText(language: BrowserUiLanguage = 'en') {
  const locale = resolveUiLanguage(language, navigator.language)
  const dictionary = dictionaries[locale]
  return (key: BrowserTextKey, values: Readonly<Record<string, string | number>> = {}): string => {
    if (isDictionaryKey(key)) {
      if (key.startsWith('suite.')) return suiteLocales[locale][key.slice(6) as keyof typeof suiteLocales.en].replace(/\{(\w+)\}/g, (match, name: string) => values[name] === undefined ? match : String(values[name]))
      if (Object.hasOwn(extensionCopy, key)) return extensionCopy[key as ExtensionKey][extensionLocales.indexOf(locale)]
      if (Object.hasOwn(dictionary, key)) return dictionary[key as SharedBrowserKey]
    }
    return dictionary.unknownError
  }
}
/**
 * An error code is read as an own property: a code such as `toString` would otherwise reach the
 * prototype chain and resolve to a function instead of a message.
 */
export function errorKey(code: string): BrowserTextKey {
  const alias = Object.hasOwn(ERROR_ALIASES, code) ? ERROR_ALIASES[code] : undefined
  if (alias) return alias
  return Object.hasOwn(browserZh, code) || Object.hasOwn(extensionCopy, code) ? code as BrowserKey : `${UNKNOWN_PREFIX}${code}`
}
