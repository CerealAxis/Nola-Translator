import { useEffect, useState, useSyncExternalStore } from 'react'
import { notifyError } from '@/components/primitives/notify'
import { resolveUiLanguage, translate } from '@/i18n'
import { getBridge } from '@/store'
import { textProcessingErrorKey, type TextProcessingConfig, type TextProcessingResult } from '../../../../shared/text-processing'
import { optimization, preprocessing } from './text-processing-features'

export interface Rule {
  id: string
  pattern: string
  replacement: string
  regex: boolean
  escape: boolean
  caseSensitive: boolean
  wholeWord: boolean
}

export interface RuleTable {
  id: string
  name: string
  rules: Rule[]
}

export interface FeatureOptions {
  form?: string
  count?: string
  keepEnd?: boolean
  keepSingle?: boolean
  rules?: Rule[]
  vndbId?: string
  vndbTargets?: { replace: boolean; glossary: boolean }
}

const PREFIX = 'nola:text-processing-preview:'
let committed: TextProcessingConfig | undefined
let connection: ReturnType<typeof connect> | undefined
let version = 0
let loadSettled = false
const pending = new Map<string, { value: unknown }>()
const listeners = new Set<() => void>()

function update(config?: TextProcessingConfig) {
  if (config && (!committed || config.revision >= committed.revision)) committed = config
  version++
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function toast(issue: TextProcessingResult['issues'][number]) {
  const language = resolveUiLanguage('auto', document.documentElement.lang || navigator.language)
  const label = [...preprocessing, ...optimization].find(feature => feature.id === issue.feature)?.label
  const reason = `suite.${textProcessingErrorKey(issue.reason)}` as const
  notifyError(translate(reason, language), { description: label ? translate(label, language) : undefined })
}

function legacySettings() {
  const values: Record<string, unknown> = {}
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith(PREFIX)) continue
      try { values[key.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(key) ?? 'null') }
      catch { /* Keep a damaged entry from interrupting migration of the others. */ }
    }
  } catch { /* Storage is unavailable in this document. */ }
  return values
}

function connect(migrate: boolean) {
  const api = getBridge()?.textProcessing
  if (!api) return undefined
  const changed = api.onChanged(update)
  const notice = api.onError(toast)
  const ready = (migrate ? api.load(legacySettings()) : api.snapshot()).then(update).finally(() => {
    loadSettled = true
    update()
  })
  void ready.catch(() => { if (migrate) toast({ feature: 'settings', reason: 'load' }) })
  return { api, ready, close: () => { changed(); notice() } }
}

export function initTextProcessing(migrate: boolean) {
  connection ??= connect(migrate)
}

if (import.meta.hot) import.meta.hot.dispose(() => connection?.close())

export function useTextProcessingReady() {
  useSyncExternalStore(subscribe, () => version)
  return !connection || loadSettled
}

export function readPreviewSetting<T>(name: string, fallback: T): T {
  if (pending.has(name)) return pending.get(name)!.value as T
  if (committed) return Object.hasOwn(committed.values, name) ? committed.values[name] as T : fallback
  try {
    const stored = localStorage.getItem(PREFIX + name)
    if (stored !== null) return JSON.parse(stored) as T
  } catch {
    return fallback
  }
  return fallback
}

export async function writePreviewSetting(name: string, value: unknown): Promise<boolean> {
  const operation = { value }
  const api = connection?.api
  if (!api) {
    try { localStorage.setItem(PREFIX + name, JSON.stringify(value)) }
    catch {
      toast({ feature: 'settings', reason: 'save' })
      return false
    }
    update()
    return true
  }
  pending.set(name, operation)
  update()
  try {
    await connection?.ready
    update(await api.save(name, value))
    return true
  } catch {
    toast({ feature: 'settings', reason: name === 'options:vndb' ? 'vndb' : 'save' })
    return false
  } finally {
    if (pending.get(name) === operation) pending.delete(name)
    update()
  }
}

export function usePreviewSetting<T>(name: string, fallback: T) {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => { initTextProcessing(false) }, [])
  return [readPreviewSetting(name, fallback), (value: T) => writePreviewSetting(name, value)] as const
}

export function useTextProcessingEnabled(scene: string | undefined) {
  const [active] = usePreviewSetting('scene:' + scene, true)
  return active
}

export function useProcessingPreview(input: string, fallback: () => string, feature?: string, options?: FeatureOptions) {
  const revision = useSyncExternalStore(subscribe, () => version)
  const [output, setOutput] = useState('')
  const api = connection?.api
  useEffect(() => {
    if (!api || !input) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      const overrides = feature ? { enabled: { [feature]: true }, ['options:' + feature]: options } : undefined
      void api.preview(input, overrides).then(result => {
        if (!cancelled) setOutput(result.text)
      }).catch(() => {
        if (!cancelled) {
          setOutput('')
          toast({ feature: 'preview', reason: 'backend' })
        }
      })
    }, 180)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [api, input, feature, options, revision])
  return !api ? fallback() : input ? output : ''
}
