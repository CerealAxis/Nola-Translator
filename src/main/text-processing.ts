import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { GlossaryLibrary } from '../shared/glossary'
import { glossaryEntryKey } from '../shared/glossary-match'
import {
  parseTextSetting, preprocessingIds, type TextProcessingConfig,
  type TextProcessingRequest, type TextProcessingResult, type TextReplacementTable,
} from '../shared/text-processing'
import type { BackendSupervisor } from './backend-supervisor'

const initial: TextProcessingConfig = { revision: 0, values: {} }
const maxBytes = 8 * 1024 * 1024
const optimizationIds = ['replace-before', 'skip-punctuation', 'python-optimize', 'replace-after', 'arabic']
const embeddedPreprocessing = new Set(['normalize', 'breaks', 'tags', 'braces', 'replace', 'python-pre'])
const nameSchema = z.object({ original: z.string().min(1).max(200), name: z.string().min(1).max(200) })
const configSchema = z.object({
  revision: z.number().int().nonnegative(),
  values: z.record(z.string(), z.unknown()),
})
function parseValues(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, parseTextSetting(key, value)]))
}

async function fetchVndbNames(id: string) {
  const names = new Map<string, string>()
  const signal = AbortSignal.timeout(12_000)
  for (let page = 1; page <= 100; page++) {
    const response = await fetch('https://api.vndb.org/kana/character', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters: ['vn', '=', ['id', '=', id]], fields: 'name,original,aliases', results: 100, page }),
      signal,
    })
    if (!response.ok) throw new Error('vndb')
    const body = z.object({ more: z.boolean(), results: z.array(z.object({
      name: z.string(), original: z.string().nullable(), aliases: z.array(z.string()),
    })).max(100) }).parse(await response.json())
    for (const character of body.results) {
      for (const original of [character.original, ...character.aliases]) {
        if (original?.trim() && original !== character.name && nameSchema.safeParse({ original, name: character.name }).success && !names.has(original)) {
          names.set(original, character.name)
        }
      }
    }
    if (!body.more) return [...names].slice(0, 10000).map(([original, name]) => ({ original, name }))
  }
  throw new Error('vndb')
}

function vndbLibraryId(id: string) {
  const hash = createHash('sha256').update('nola-vndb:' + id).digest('hex')
  return [hash.slice(0, 8), hash.slice(8, 12), '8' + hash.slice(13, 16), '8' + hash.slice(17, 20), hash.slice(20, 32)].join('-')
}

export class TextProcessing {
  private document = initial
  private readonly ready: Promise<void>
  private queue: Promise<unknown> = Promise.resolve()
  private readonly reported = new Set<string>()

  constructor(
    private readonly path: string,
    private readonly backend: () => Promise<BackendSupervisor | null>,
    private readonly changed: () => void,
    private readonly notice: (issue: TextProcessingResult['issues'][number]) => void,
    private readonly importGlossary?: (library: GlossaryLibrary) => Promise<void>,
  ) {
    this.ready = this.load()
    void this.ready.catch(() => this.report({ feature: 'settings', reason: 'load' }))
  }

  private async load() {
    try {
      const raw = await readFile(this.path)
      if (raw.byteLength > maxBytes) throw new Error('textProcessingTooLarge')
      const document = configSchema.parse(JSON.parse(raw.toString('utf8')))
      this.document = { ...document, values: parseValues(document.values) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  private update(change: () => Promise<TextProcessingConfig>, beforeCommit?: () => Promise<void>) {
    const operation = this.queue.then(async () => {
      await this.ready
      const next = await change()
      if (next === this.document) return next
      const raw = JSON.stringify(next)
      if (Buffer.byteLength(raw) > maxBytes) throw new Error('textProcessingTooLarge')
      await mkdir(dirname(this.path), { recursive: true })
      const temporary = this.path + '.' + randomUUID() + '.tmp'
      try {
        const handle = await open(temporary, 'wx', 0o600)
        try {
          await handle.writeFile(raw)
          await handle.sync()
        } finally {
          await handle.close()
        }
        await beforeCommit?.()
        await rename(temporary, this.path)
      } finally {
        await rm(temporary, { force: true }).catch(() => {})
      }
      this.document = next
      this.reported.clear()
      this.changed()
      return next
    })
    this.queue = operation.catch(() => {})
    return operation
  }

  save(key: string, value: unknown) {
    const parsed = parseTextSetting(key, value)
    let importedLibrary: GlossaryLibrary | undefined
    return this.update(async () => {
      const values = { ...this.document.values, [key]: parsed }
      if (key === 'options:vndb') {
        const options = parsed as { vndbId?: string; vndbTargets?: { replace: boolean; glossary: boolean } }
        const number = options.vndbId?.toLowerCase().replace(/^v/, '')
        const id = number ? 'v' + number : ''
        values[key] = { ...options, vndbId: id }
        const { replace, glossary } = options.vndbTargets ?? { replace: true, glossary: true }
        if (id && (replace || glossary)) {
          const names = await fetchVndbNames(id)
          if (!names.length) throw new Error('vndb')
          const name = 'VNDB ' + id
          if (replace) {
            const tables = values['tables:replace-before'] as TextReplacementTable[] | undefined
            const current = tables ?? []
            const existing = current.find(table => table.id === 'vndb-' + id)
            const patterns = new Set(existing?.rules.map(rule => rule.pattern))
            const rules = names.filter(item => !patterns.has(item.original)).map(item => ({
              id: randomUUID(), pattern: item.original, replacement: item.name,
              regex: false, escape: false, caseSensitive: true, wholeWord: /^[\x00-\x7f]+$/.test(item.original),
            }))
            values['tables:replace-before'] = parseTextSetting('tables:replace-before', existing
              ? current.map(table => table === existing ? { ...table, rules: [...table.rules, ...rules] } : table)
              : [...current, { id: 'vndb-' + id, name, rules }])
          }
          if (glossary) {
            const entries = names.map(item => ({ id: randomUUID(), source: item.original.trim(), target: item.name.trim(),
              targetLanguage: '*', caseSensitive: true, enabled: true }))
            importedLibrary = { id: vndbLibraryId(id), name, enabled: true, description: '', scope: { mode: 'global' },
              entries: [...new Map(entries.map(entry => [glossaryEntryKey(entry), entry])).values()] }
          }
        }
      }
      return { ...this.document, revision: this.document.revision + 1, values }
    }, async () => {
      if (importedLibrary) await this.importGlossary?.(importedLibrary)
    })
  }

  async flush() { await this.queue }

  readReady() { return this.ready }

  snapshot() { return this.document }

  separatesEmbedded(scene: string) {
    const values = this.document.values
    if (values['scene:' + scene] === false) return false
    const enabled = values.enabled as Record<string, boolean> | undefined
    return Boolean(enabled && (enabled['replace-before'] || enabled['python-optimize'] ||
      preprocessingIds.some(id => enabled[id] && !embeddedPreprocessing.has(id))))
  }

  report(issue: TextProcessingResult['issues'][number]) {
    const key = issue.feature + ':' + issue.reason
    if (this.reported.has(key)) return
    this.reported.add(key)
    this.notice(issue)
  }

  async receiveRealtimeIssues(backend: BackendSupervisor) {
    const response = await fetch(new URL('/api/v2/text-processing/issues', backend.baseUrl), {
      headers: backend.authorizationHeader(), signal: AbortSignal.timeout(900),
    })
    if (!response.ok) return
    const issues = await response.json() as TextProcessingResult['issues']
    for (const issue of issues) this.report(issue)
  }

  private async apply(
    document: TextProcessingConfig, phase: 'input' | 'output' | 'preview',
    input: TextProcessingRequest, context?: unknown, signal?: AbortSignal,
  ): Promise<TextProcessingResult> {
    if (input.text.length > 64000) throw new Error('textLimit')
    const backend = await this.backend()
    if (!backend) throw new Error('backendUnavailable')
    const timeout = AbortSignal.timeout(10_000)
    const response = await fetch(new URL('/api/v2/text-processing/apply', backend.baseUrl), {
      method: 'POST', headers: { ...backend.authorizationHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ document, phase, ...input, context }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (!response.ok) throw new Error('backendUnavailable')
    const result = await response.json() as TextProcessingResult
    for (const issue of result.issues) this.report(issue)
    return result
  }

  async preview(text: string, overrides: Record<string, unknown> = {}) {
    await this.ready
    const values = { ...this.document.values, ...parseValues(overrides) }
    return this.apply({ ...this.document, values }, 'preview', { text, kind: 'preview' })
  }

  async prepare(scene: string, input: TextProcessingRequest, signal?: AbortSignal, document?: TextProcessingConfig) {
    await this.ready.catch(() => {})
    const config = document ?? this.document
    const enabled = config.values.enabled as Record<string, boolean> | undefined
    const choice = config.values['scene:' + scene]
    const active = choice !== false
    const run = async (phase: 'input' | 'output', data: TextProcessingRequest, context?: unknown) => {
      try {
        return await this.apply(config, phase, data, context, signal)
      } catch (error) {
        if (signal?.aborted) throw error
        this.report({ feature: phase, reason: 'backend' })
        return { text: data.text, skip: false, context: undefined, issues: [] }
      }
    }
    const processInput = active && (preprocessingIds.some(id => enabled?.[id]) ||
      optimizationIds.slice(0, 3).some(id => enabled?.[id]))
    const processed = processInput ? await run('input', input) : { text: input.text, skip: false, context: undefined }
    return {
      text: processed.text, skip: processed.skip, glossary: active, protect: active,
      selection: choice === true ? { mode: 'auto' as const } : undefined,
      finish: async (text: string) => {
        if (!active || !(enabled?.['replace-after'] || enabled?.['python-optimize'] || enabled?.arabic)) return text
        return (await run('output', { ...input, text }, processed.context)).text
      },
    }
  }
}
