import { zhCN } from './zh-CN'
import type { Dictionary, DictionaryKey } from './zh-CN'

export type LocaleMessages = Record<DictionaryKey, string>

export function buildLocaleDictionary(messages: LocaleMessages): Dictionary {
  const build = (source: unknown, path = ''): unknown => {
    if (typeof source === 'string') return messages[path as DictionaryKey]
    if (typeof source !== 'object' || source === null) return source

    return Object.fromEntries(
      Object.entries(source).map(([key, value]) => [key, build(value, path ? `${path}.${key}` : key)]),
    )
  }

  return build(zhCN) as Dictionary
}
