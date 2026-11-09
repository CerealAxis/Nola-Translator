import { generateWith } from './provider-execution'
import type { ProviderConnection } from './providers'

interface Item { text: string; prompt: string; signal: AbortSignal; resolve(value: string): void; reject(reason: unknown): void }
type RunTranslation = (signal: AbortSignal, run: () => Promise<string>) => Promise<string>
interface Batch { provider: ProviderConnection; items: Item[]; runSingle(item: Item): Promise<string>; run: RunTranslation }
const pending = new Map<string, Batch>()
export function parseBatchResult(text: string, length: number): string[] {
  const parsed: unknown = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
  if (!Array.isArray(parsed) || parsed.length !== length) throw new Error('providerBatchFormat')
  const result = new Map<number, string>()
  for (const item of parsed) {
    if (!item || !Number.isInteger(item.id) || item.id < 0 || item.id >= length || typeof item.text !== 'string' || !item.text.trim() || result.has(item.id)) throw new Error('providerBatchFormat')
    result.set(item.id, item.text)
  }
  return Array.from({ length }, (_, index) => result.get(index)!)
}
async function flush(key: string): Promise<void> {
  const batch = pending.get(key)
  if (!batch) return
  pending.delete(key)
  const items = batch.items.filter(item => !item.signal.aborted)
  for (const item of batch.items.filter(item => item.signal.aborted)) item.reject(item.signal.reason)
  if (!items.length) return
  if (items.length === 1) { const item = items[0]; void batch.runSingle(item).then(item.resolve, item.reject); return }
  const controller = new AbortController()
  const abort = () => { if (items.every(item => item.signal.aborted)) controller.abort() }
  for (const item of items) item.signal.addEventListener('abort', abort, { once: true })
  try {
    const prompt = 'Complete each translation task below. Return ONLY a JSON array of {"id":number,"text":string}, one result for every task ID. Keep all IDs unchanged.\n' + JSON.stringify(items.map((item, id) => ({ id, task: item.prompt })))
    const response = await batch.run(controller.signal, () => generateWith(batch.provider, prompt, controller.signal))
    let translated: string[]
    try { translated = parseBatchResult(response, items.length) }
    catch {
      await Promise.all(items.map(async item => {
        if (item.signal.aborted) { item.reject(item.signal.reason); return }
        try { item.resolve(await batch.runSingle(item)) } catch (error) { item.reject(error) }
      }))
      return
    }
    items.forEach((item, index) => item.signal.aborted ? item.reject(item.signal.reason) : item.resolve(translated[index]))
  } catch (error) { items.forEach(item => item.reject(error)) }
  finally { items.forEach(item => item.signal.removeEventListener('abort', abort)) }
}
export function batchTranslation(key: string, provider: ProviderConnection, text: string, prompt: string, size: number, signal: AbortSignal, runSingle: (item: Item) => Promise<string>, run: RunTranslation): Promise<string> {
  if (!provider.capabilities.includes('llm') || provider.preset === 'nola' || size <= 1 || prompt.length > 5000) return runSingle({ text, prompt, signal, resolve() {}, reject() {} })
  return new Promise((resolve, reject) => {
    let batch = pending.get(key)
    if (batch && batch.items.reduce((sum, item) => sum + item.prompt.length, 0) + prompt.length > 12000) { void flush(key); batch = undefined }
    if (!batch) { batch = { provider, items: [], runSingle, run }; pending.set(key, batch); setTimeout(() => { void flush(key) }, 30) }
    batch.items.push({ text, prompt, signal, resolve, reject })
    if (batch.items.length >= Math.min(size, 32)) void flush(key)
  })
}
