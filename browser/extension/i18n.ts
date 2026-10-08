import { browserEn, browserZh } from '../../src/renderer/i18n/browser-ui'
export type BrowserKey = keyof typeof browserZh
/**
 * An unrecognised code keeps its own spelling so the user can report it and the
 * dictionary stays a closed set of keys.
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
}
function isDictionaryKey(key: BrowserTextKey): key is BrowserKey {
  return !(key as string).startsWith(UNKNOWN_PREFIX)
}
export function browserText(language: 'zh-CN' | 'en' = 'en') {
  const dictionary = language === 'zh-CN' ? browserZh : browserEn
  return (key: BrowserTextKey): string => {
    if (isDictionaryKey(key)) return dictionary[key]
    // A code arrives from the desktop process, so it is capped before it reaches the DOM.
    const code = (key as string).slice(UNKNOWN_PREFIX.length).slice(0, 64)
    return dictionary.unknownError.replace('{code}', () => code)
  }
}
export function errorKey(code: string): BrowserTextKey {
  const alias = ERROR_ALIASES[code]
  if (alias) return alias
  return code in browserZh ? code as BrowserKey : `${UNKNOWN_PREFIX}${code}`
}