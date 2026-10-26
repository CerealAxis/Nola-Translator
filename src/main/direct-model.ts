import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { EngineLaunchSpec } from './engine-process'
import { directModelRequestSchema, type DirectModelRequest, type DirectModelResult } from '../shared/agent-workspace'
import type { AppSettings, CredentialProvider, TranslationProvider } from '../shared/settings'
import { recognitionFieldsOf, translationOptionsOf } from '../shared/cloud-config'
import { customCredentialSlot, customModelsOf } from '../shared/custom-models'
import { INDEX_TRANSLATE_MODEL_IDS, INDEX_TRANSLATE_TRANSFORMERS_MODEL_IDS } from '../shared/index-translate'
import { LOCAL_LANGUAGE_MODEL_CONTEXT_SIZE } from '../shared/language-model'

export interface DirectModelServices {
  getSettings(): AppSettings
  getCredential(provider: CredentialProvider): Promise<string>
  directLaunch?(model: string, options?: { requiresImages?: boolean }): Promise<EngineLaunchSpec>
}

let workerQueue: Promise<unknown> = Promise.resolve()
let queuedWorkers = 0
type PersistentWorker = { model: string; child: ReturnType<typeof spawn>; buffer: string; pending: { resolve: (value: DirectModelResult) => void; reject: (error: Error) => void; id: string } | null }
const persistentWorkers = new Map<number, PersistentWorker>()
// Tool inference must not replace the language model that requested the tool.
const languageModelWorkers = new Map<number, PersistentWorker>()
const localConnectionSchema = z.object({ endpoint: z.string().url(), contextWindow: z.number().int().min(512).max(32768) })

function terminateWorker(worker: PersistentWorker): void {
  if (process.platform === 'win32' && worker.child.pid) execFile('taskkill', ['/PID', String(worker.child.pid), '/T', '/F'], { windowsHide: true }, () => undefined)
  else worker.child.kill()
}

export async function closeDirectModelWorker(ownerId: number): Promise<void> {
  await Promise.all([closeWorker(ownerId, persistentWorkers), closeWorker(ownerId, languageModelWorkers)])
}

async function closeWorker(ownerId: number, workers: Map<number, PersistentWorker>): Promise<void> {
  const worker = workers.get(ownerId)
  if (!worker) return
  workers.delete(ownerId)
  if (worker.pending) worker.pending.reject(new DOMException('Workbench model released', 'AbortError'))
  worker.pending = null
  const exited = worker.child.exitCode !== null
    ? Promise.resolve()
    : new Promise<void>(resolve => worker!.child.once('close', () => resolve()))
  terminateWorker(worker)
  await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 10_000))])
}

export async function closeAllDirectModelWorkers(): Promise<void> {
  await Promise.all([...new Set([...persistentWorkers.keys(), ...languageModelWorkers.keys()])].map(closeDirectModelWorker))
}

export async function runDirectModel(services: DirectModelServices, raw: DirectModelRequest, signal: AbortSignal, inspect = false, ownerId?: number): Promise<DirectModelResult> {
  return queueWorker(() => executeDirectModel(services, raw, signal, inspect, ownerId), signal)
}

async function queueWorker<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (queuedWorkers >= 8) throw new Error('Too many pending inference tasks')
  queuedWorkers++
  const task = workerQueue.catch(() => undefined).then(() => {
    signal.throwIfAborted()
    return run()
  })
  workerQueue = task
  try { return await task }
  finally { queuedWorkers-- }
}

/** The worker returns a loopback connection only to the main process, never to renderer IPC. */
export async function prepareLocalLanguageModel(services: DirectModelServices, ownerId: number, resourceId: string, signal: AbortSignal) {
  if (!/^qwen35-[a-zA-Z0-9_.-]+$/.test(resourceId)) throw new Error('Select an installed local language model')
  return queueWorker(async () => {
    if (!services.directLaunch) throw new Error('Local language model runtime unavailable')
    const compute = { ...services.getSettings().compute, translationEngine: 'llama', contextSize: LOCAL_LANGUAGE_MODEL_CONTEXT_SIZE }
    const model = `resource:${resourceId}`
    const launch = await services.directLaunch(model)
    signal.throwIfAborted()
    const result = localConnectionSchema.parse(await runPersistentWorker(ownerId, `${model}:${JSON.stringify(compute)}`, launch, {
      id: randomUUID(), kind: 'llm', resourceId,
      config: { compute, recognitionProvider: 'aliyun', sourceLanguage: 'auto', targetLanguages: ['zh'],
        translationProvider: 'local', translationModelId: resourceId },
    }, signal, languageModelWorkers))
    const endpoint = new URL(result.endpoint)
    if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port || endpoint.pathname !== '/v1'
      || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Invalid local language model endpoint')
    return result
  }, signal)
}

/** Local models stay in an owner-scoped worker; cloud work uses a one-shot worker. */
async function executeDirectModel(services: DirectModelServices, raw: DirectModelRequest, signal: AbortSignal, inspect: boolean, ownerId?: number): Promise<DirectModelResult> {
  const request = directModelRequestSchema.parse(raw)
  if (!services.directLaunch) throw new Error('Direct model runtime unavailable')
  const settings = services.getSettings()
  const resourceId = request.model.startsWith('resource:') ? request.model.slice(9) : undefined
  if (ownerId !== undefined && !resourceId) await closeWorker(ownerId, persistentWorkers)
  const config: Record<string, unknown> = { compute: { ...settings.compute }, recognitionProvider: 'aliyun',
    sourceLanguage: request.source, targetLanguages: request.kind === 'mt' ? [request.target] : [], translationProvider: 'local' }
  if (request.kind === 'asr') {
    const provider = resourceId ? 'local' : request.model === 'cloud:aliyun' ? 'aliyun' : request.model === 'cloud:minimax' ? 'minimax' : null
    if (!provider) throw new Error('Unknown recognition model')
    Object.assign(config, recognitionFieldsOf({ ...settings.recognition, provider }), { recognitionModelId: resourceId })
    if (provider !== 'local') config.recognitionOptions = { ...(config.recognitionOptions as object), apiKey: await services.getCredential(provider === 'aliyun' ? 'aliyun-asr' : 'minimax-asr') }
  } else if (request.kind === 'mt') {
    if (request.image && request.model !== 'cloud:index-translate' && !new Set<string>([...INDEX_TRANSLATE_MODEL_IDS, ...INDEX_TRANSLATE_TRANSFORMERS_MODEL_IDS]).has(resourceId ?? '')) throw new Error('Image translation requires an Index-Translate model')
    if (resourceId) Object.assign(config, { translationProvider: 'local', translationModelId: resourceId })
    else if (request.model.startsWith('mt-custom:')) {
      const profile = customModelsOf(settings.translation).find(item => item.id === request.model.slice(10))
      if (!profile) throw new Error('Language model configuration unavailable')
      Object.assign(config, { translationProvider: 'cloud', translationOptions: { endpoint: profile.endpoint, model: profile.model,
        apiFormat: profile.apiFormat, contextWindow: profile.contextWindow, maxOutputTokens: profile.maxOutputTokens,
        apiKey: await services.getCredential(customCredentialSlot(profile.id)) } })
    } else {
      const provider = request.model.slice(6) as TranslationProvider
      if (!request.model.startsWith('cloud:') || !['microsoft', 'mymemory', 'google', 'index-translate'].includes(provider)) throw new Error('Select a text translation model')
      const options = translationOptionsOf({ ...settings.translation, provider })
      Object.assign(config, { translationProvider: provider, translationOptions: { ...options,
        ...(provider === 'microsoft' || provider === 'google' ? { apiKey: await services.getCredential(provider) } : {}) } })
    }
    if (!request.text.trim() && !request.image) throw new Error('Translation input is empty')
  } else if (!resourceId) throw new Error('Select an installed speech synthesis model')
  if (request.kind === 'tts' && !inspect && !request.text.trim()) throw new Error('Speech input is empty')
  signal.throwIfAborted()
  const launch = await services.directLaunch(request.model, { requiresImages: !!request.image })
  signal.throwIfAborted()
  const workerRequest = { ...request, resourceId, config, inspect }
  if (ownerId !== undefined && resourceId) return runPersistentWorker(ownerId, request.model, launch, workerRequest, signal)
  return new Promise((resolve, reject) => {
    const child = spawn(launch.command, launch.args, { cwd: launch.cwd, env: { ...process.env, ...launch.env,
      HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', PYTHONIOENCODING: 'utf-8' }, windowsHide: true, stdio: 'pipe' })
    let output = ''
    let diagnostic = ''
    const stop = () => {
      if (process.platform === 'win32' && child.pid) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => undefined)
      else child.kill()
    }
    const timeout = setTimeout(stop, 10 * 60 * 1000)
    signal.addEventListener('abort', stop, { once: true })
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { output += chunk; if (output.length > 32 * 1024 * 1024) stop() })
    // Inference libraries can include prompts and credentials in diagnostics; never forward stderr.
    child.stderr.on('data', () => { diagnostic = 'Inference worker failed. Check the selected model and installed runtime.' })
    child.on('error', reject)
    child.once('close', () => {
      clearTimeout(timeout); signal.removeEventListener('abort', stop)
      if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
      try {
        const result = JSON.parse(output) as DirectModelResult & { error?: string }
        if (result.error) {
          const options = config.translationOptions as { apiKey?: string } | undefined
          const recognition = config.recognitionOptions as { apiKey?: string } | undefined
          let message = result.error
          for (const key of [options?.apiKey, recognition?.apiKey]) if (key) message = message.replaceAll(key, '[redacted]')
          reject(new Error(message)); return
        }
        if (typeof result.text !== 'string' || result.audio && !result.audio.startsWith('data:audio/wav;base64,')) throw new Error('Invalid inference result')
        resolve(result)
      } catch { reject(new Error(diagnostic || 'Inference worker returned no result')) }
    })
    child.stdin.on('error', () => undefined)
    child.stdin.end(JSON.stringify(workerRequest))
  })
}

function runPersistentWorker(ownerId: number, model: string, launch: EngineLaunchSpec, request: Record<string, unknown> & { id: string }, signal: AbortSignal,
  workers = persistentWorkers): Promise<DirectModelResult> {
  return (async () => {
    let worker = workers.get(ownerId)
    if (worker && worker.model !== model) {
      await closeWorker(ownerId, workers)
      worker = undefined
    }
    if (!worker) {
      const child = spawn(launch.command, launch.args, { cwd: launch.cwd, env: { ...process.env, ...launch.env,
        HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', PYTHONIOENCODING: 'utf-8' }, windowsHide: true, stdio: 'pipe' })
      worker = { model, child, buffer: '', pending: null }
      workers.set(ownerId, worker)
      // Drain native diagnostics so a full stderr pipe cannot stall model startup.
      // Request failures arrive on stdout; prompts and credentials must not be forwarded.
      child.stderr.on('data', () => undefined)
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        worker!.buffer += chunk
        let newline = worker!.buffer.indexOf('\n')
        while (newline >= 0) {
          const line = worker!.buffer.slice(0, newline)
          worker!.buffer = worker!.buffer.slice(newline + 1)
          newline = worker!.buffer.indexOf('\n')
          if (!line || !worker!.pending) continue
          const pending = worker!.pending
          worker!.pending = null
          try {
            const value = JSON.parse(line) as DirectModelResult & { id?: string; error?: string }
            if (value.id !== pending.id) throw new Error('Inference worker returned an out-of-order response')
            if (value.error) throw new Error(value.error)
            pending.resolve(value)
          } catch (error) { pending.reject(error instanceof Error ? error : new Error(String(error))) }
        }
      })
      child.once('error', error => {
        if (workers.get(ownerId) === worker) workers.delete(ownerId)
        worker!.pending?.reject(error)
        worker!.pending = null
      })
      child.once('close', () => {
        if (workers.get(ownerId) === worker) workers.delete(ownerId)
        worker!.pending?.reject(new Error('Local model worker stopped'))
        worker!.pending = null
      })
    }
    signal.throwIfAborted()
    return new Promise<DirectModelResult>((resolve, reject) => {
      const active = worker!
      const stop = () => {
        if (active.pending?.id === request.id) {
          active.pending.reject(new DOMException('Aborted', 'AbortError'))
          active.pending = null
          void closeWorker(ownerId, workers)
        }
      }
      signal.addEventListener('abort', stop, { once: true })
      const timeout = setTimeout(() => {
        if (active.pending?.id === request.id) {
          active.pending.reject(new Error('Local model inference timed out'))
          active.pending = null
          void closeWorker(ownerId, workers)
        }
      }, 10 * 60 * 1000)
      const cleanup = () => { clearTimeout(timeout); signal.removeEventListener('abort', stop) }
      active.pending = { id: request.id,
        resolve: value => { cleanup(); resolve(value) },
        reject: error => { cleanup(); reject(error) },
      }
      const stdin = active.child.stdin
      if (!stdin) { active.pending = null; cleanup(); reject(new Error('Local model worker input is unavailable')); return }
      stdin.write(`${JSON.stringify(request)}\n`, error => {
        if (error && active.pending?.id === request.id) { active.pending = null; cleanup(); reject(error) }
      })
    })
  })()
}
