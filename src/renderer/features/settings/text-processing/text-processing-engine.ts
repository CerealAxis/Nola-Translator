import type { FeatureOptions, Rule, RuleTable } from './text-processing-preview'

function unescapeText(value: string): string {
  return value
    .replaceAll('\\n', '\n')
    .replaceAll('\\r', '\r')
    .replaceAll('\\t', '\t')
    .replaceAll('\\\\', '\\')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseInlineRegex(pattern: string): { body: string; flags: string } | null {
  if (!pattern.startsWith('/') || pattern.length < 2) return null
  const lastSlash = pattern.lastIndexOf('/')
  if (lastSlash <= 0) return null
  const body = pattern.slice(1, lastSlash)
  const rawFlags = pattern.slice(lastSlash + 1)
  if (!/^[gimsuvy]*$/.test(rawFlags)) return null
  const flags = rawFlags.includes('g') ? rawFlags : 'g' + rawFlags
  return { body, flags }
}

export function applyRuleList(text: string, rules: readonly Rule[]): string {
  let result = text
  for (const rule of rules) {
    if (!rule.pattern) continue
    const inline = !rule.regex ? parseInlineRegex(rule.pattern) : null
    if (inline) {
      try {
        result = result.replace(new RegExp(inline.body, inline.flags), rule.replacement)
      } catch {
        // Skip invalid user regex during live preview.
      }
      continue
    }
    const rawPattern = rule.escape ? unescapeText(rule.pattern) : rule.pattern
    const rawReplacement = rule.escape ? unescapeText(rule.replacement) : rule.replacement
    const base = rule.regex ? rawPattern : escapeRegExp(rawPattern)
    const pattern = rule.wholeWord ? `\\b(?:${base})\\b` : base
    const flags = rule.caseSensitive ? 'g' : 'gi'
    try {
      const regex = new RegExp(pattern, flags)
      result = rule.regex
        ? result.replace(regex, rawReplacement)
        : result.replace(regex, () => rawReplacement)
    } catch {
      // Skip invalid user regex during live preview.
    }
  }
  return result
}

function dedupChars(text: string, count: number, keepSingle: boolean): string {
  if (!text) return ''
  let times = count
  if (times < 2) {
    const freq = new Map<number, number>()
    let run = 1
    let prev = ''
    for (const ch of [...text, '\0']) {
      if (ch !== prev) {
        if (prev) freq.set(run, (freq.get(run) ?? 0) + 1)
        prev = ch
        run = 1
      } else {
        run++
      }
    }
    const maxFreq = Math.max(...freq.values(), 0)
    const candidates = [...freq.entries()]
      .filter(([, value]) => value === maxFreq)
      .map(([key]) => key)
      .sort((a, b) => a - b)
    times = candidates[0] === 1 && candidates.length > 1 ? candidates[1] : (candidates[0] ?? 1)
  }
  if (times < 2) return text
  if (keepSingle) {
    let out = ''
    let i = 0
    while (i < text.length) {
      out += text[i]
      const slice = text.slice(i, i + times)
      if (slice.length === times && new Set(slice).size === 1) i += times
      else i += 1
    }
    return out
  }
  let out = ''
  for (let i = 0; i + times <= text.length; i += times) out += text[i]
  return out
}

function dedupBlock(text: string, count: number): string {
  if (!text) return ''
  if (count >= 2) return text.slice(0, Math.floor(text.length / count))
  for (let times = text.length; times >= 2; times--) {
    if (text.length % times !== 0) continue
    const unit = text.slice(0, text.length / times)
    if (unit.repeat(times) === text) return unit
  }
  return text
}

function dedupSegments(text: string): string {
  let rest = text
  let out = ''
  while (rest.length) {
    let matched = false
    for (let len = Math.floor(rest.length / 2); len > 1; len--) {
      const part = rest.slice(0, len)
      if (rest.slice(len, len * 2) === part) {
        out += part
        rest = rest.slice(len * 2)
        matched = true
        break
      }
    }
    if (!matched) {
      out += rest[0]
      rest = rest.slice(1)
    }
  }
  return out
}

function dedupShrink(text: string): string {
  for (let i = 0; i < text.length; i++) {
    const sub = text.slice(i)
    if (sub.length >= 2 && text.slice(0, i).endsWith(sub.slice(0, -1))) {
      return text.slice(0, i)
    }
  }
  return text
}

function dedupGrow(text: string): string {
  let i = 1
  while (i <= Math.floor(text.length / 2)) {
    const prefix = text.slice(0, i)
    if (text.slice(i).startsWith(prefix)) {
      text = text.slice(i)
      i = 1
    } else {
      i++
    }
  }
  return text
}

export function runPreprocessingPreview(
  input: string,
  order: readonly string[],
  enabled: Record<string, boolean>,
  optionsById: Record<string, FeatureOptions | undefined>,
  replaceTables: readonly RuleTable[],
): string {
  let text = input
  for (const id of order) {
    if (!enabled[id]) continue
    const options = optionsById[id]
    switch (id) {
      case 'normalize':
        text = text.normalize((options?.form as 'NFC' | 'NFD' | 'NFKC' | 'NFKD' | undefined) ?? 'NFKC')
        break
      case 'controls':
        text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        break
      case 'breaks':
        text = text.replace(/\r?\n+/g, '')
        break
      case 'lines': {
        const lines = text.split(/\r?\n/)
        const count = Math.max(1, Number(options?.count ?? 1) || 1)
        if (lines.length > count) {
          text = (options?.keepEnd ?? true ? lines.slice(-count) : lines.slice(0, count)).join('\n')
        }
        break
      }
      case 'tags':
        text = text.replace(/<[^>]*>/g, '')
        break
      case 'braces':
        text = text.replace(/\{[^}]*\}/g, '')
        break
      case 'quotes': {
        const found = text.match(/「[^」]*」/g)
        if (found?.length) text = found.join('')
        break
      }
      case 'ascii-punctuation':
        text = text.replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, '')
        break
      case 'digits':
        text = text.replace(/[0-9]/g, '')
        break
      case 'letters':
        text = text.replace(/[A-Za-z]/g, '')
        break
      case 'replace':
        for (const table of replaceTables) text = applyRuleList(text, table.rules)
        break
      case 'repeat-chars':
        text = dedupChars(text, Number(options?.count ?? 1) || 1, options?.keepSingle ?? true)
        break
      case 'repeat-block':
        text = dedupBlock(text, Number(options?.count ?? 1) || 1)
        break
      case 'repeat-segments':
        text = dedupSegments(text)
        break
      case 'repeat-suffix':
        text = dedupShrink(text)
        break
      case 'repeat-prefix':
        text = dedupGrow(text)
        break
      default:
        break
    }
  }
  return text
}
