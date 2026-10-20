import { browserEn, browserZh } from '../../src/renderer/i18n/browser-ui'
import { browserJa, browserKo, browserZhHK, browserZhTW } from '../../src/renderer/i18n/browser-locales'
import { resolveUiLanguage } from '../../src/shared/languages'
import type { UiLanguage, UiLanguagePreference } from '../../src/shared/languages'
export type BrowserKey = keyof typeof browserZh
/**
 * An unrecognised code remains in store diagnostics while the UI uses actionable fallback copy.
 */
export type BrowserTextKey = BrowserKey | `unknown:${string}`
const UNKNOWN_PREFIX = 'unknown:'
// Codes that are not dictionary keys of their own resolve to the closest existing message.
const ERROR_ALIASES: Record<string, BrowserKey> = {
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
  browserCaptureTargetMismatch: 'wrongCapture',
  browserCaptureCancelled: 'captureCancelled',
  browserAudioSilent: 'tabAudioSilent',
  browserAudioBacklog: 'slowAudio',
  browserSessionAlreadyRunning: 'busy',
  browserSessionNotRunning: 'sessionNotRunning',
  browserCaptionServiceDisabled: 'captionServiceOff',
  browserIntegrationDisabled: 'appUnavailable',
}
function isDictionaryKey(key: BrowserTextKey): key is BrowserKey {
  return !(key as string).startsWith(UNKNOWN_PREFIX)
}
export type BrowserUiLanguage = UiLanguagePreference

const dictionaries: Record<UiLanguage, Record<BrowserKey, string>> = {
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
  return (key: BrowserTextKey): string => {
    if (isDictionaryKey(key) && Object.hasOwn(dictionary, key)) return dictionary[key]
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
  return Object.hasOwn(browserZh, code) ? code as BrowserKey : `${UNKNOWN_PREFIX}${code}`
}
