import { z } from 'zod'

export const preprocessingIds = [
  'normalize', 'controls', 'breaks', 'lines', 'tags', 'braces', 'quotes', 'shift-jis',
  'ascii-punctuation', 'digits', 'letters', 'replace', 'repeat-chars', 'repeat-block',
  'repeat-segments', 'repeat-suffix', 'repeat-prefix', 'python-pre',
] as const

const featureId = z.enum([...preprocessingIds, 'replace-before', 'skip-punctuation', 'replace-after',
  'python-optimize', 'arabic', 'vndb', 'glossary', 'protect', 'mask'])
const replacementId = '(?:replace|replace-before|replace-after)'
const rule = z.object({
  id: z.string().max(128), pattern: z.string().max(8192), replacement: z.string().max(8192),
  regex: z.boolean().default(false), escape: z.boolean().default(false),
  caseSensitive: z.boolean().default(false), wholeWord: z.boolean().default(false),
})
const table = z.object({ id: z.string().max(128), name: z.string().max(256), rules: z.array(rule).max(10000) })
const options = z.object({
  form: z.enum(['NFC', 'NFD', 'NFKC', 'NFKD']).optional(),
  count: z.string().regex(/^\d{1,8}$/).optional(),
  keepEnd: z.boolean().optional(),
  keepSingle: z.boolean().optional(),
  rules: z.array(rule).max(10000).optional(),
  vndbId: z.string().trim().regex(/^(?:v?\d{1,10})?$/i).optional(),
  vndbTargets: z.object({ replace: z.boolean(), glossary: z.boolean() }).optional(),
})
const script = z.string().max(262144).nullable()
export const textScene = /^(?:quick-interpret|meeting|screen|tool|game:[\w-]{1,128}|comic:[\w-]{1,128})$/

export function parseTextSetting(key: string, value: unknown): unknown {
  if (key === 'enabled') return z.partialRecord(featureId, z.boolean()).parse(value)
  if (key === 'rank') return z.array(z.enum(preprocessingIds)).max(preprocessingIds.length).parse(value)
  if (key.startsWith('scene:') && textScene.test(key.slice(6))) return z.boolean().parse(value)
  if (key.startsWith('options:')) {
    featureId.parse(key.slice(8))
    return options.parse(value)
  }
  if (new RegExp('^tables:' + replacementId + '$').test(key)) return z.array(table).max(200).parse(value)
  if (key === 'script:python-pre' || key === 'script:python-optimize') return script.parse(value)
  throw new Error('invalidTextProcessingSetting')
}

export interface TextProcessingConfig {
  revision: number
  migrated: boolean
  values: Record<string, unknown>
}

export type TextReplacementTable = z.infer<typeof table>

export interface TextProcessingRequest {
  text: string
  source?: string
  target?: string
  kind?: 'text' | 'hook' | 'embedded' | 'preview'
}

export interface TextProcessingResult {
  text: string
  skip: boolean
  context?: unknown
  issues: { feature: string; reason: string }[]
}

export function textProcessingErrorKey(reason: string) {
  switch (reason) {
    case 'regex': return 'textProcessingRegexFailed'
    case 'script': return 'textProcessingScriptFailed'
    case 'worker': return 'textProcessingWorkerFailed'
    case 'vndb': return 'textProcessingVndbFailed'
    default: return 'textProcessingFailed'
  }
}

export interface TextProcessingBridge {
  load: (legacy: Record<string, unknown>) => Promise<TextProcessingConfig>
  snapshot: () => Promise<TextProcessingConfig>
  save: (key: string, value: unknown) => Promise<TextProcessingConfig>
  preview: (text: string, overrides?: Record<string, unknown>) => Promise<TextProcessingResult>
  onChanged: (callback: (config: TextProcessingConfig) => void) => () => void
  onError: (callback: (issue: TextProcessingResult['issues'][number]) => void) => () => void
}
