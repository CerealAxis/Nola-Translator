import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { EngineLaunchSpec } from './engine-process'
import { directModelRequestSchema, type DirectModelRequest, type DirectModelResult } from '../shared/agent-workspace'
import type { AppSettings, CredentialProvider } from '../shared/settings'
import { LOCAL_LANGUAGE_MODEL_CONTEXT_SIZE } from '../shared/language-model'

export interface DirectModelServices {
  getSettings(): AppSettings
  getCredential(provider: CredentialProvider): Promise<string>
  directLaunch?(model: string, options?: { requiresImages?: boolean }): Promise<EngineLaunchSpec>
  inferModel?(request: DirectModelRequest, signal: AbortSignal, inspect?: boolean): Promise<DirectModelResult>
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

export async function runDirectModel(services: DirectModelServices, raw: DirectModelRequest, signal: AbortSignal, inspect = false, _ownerId?: number): Promise<DirectModelResult> {
  if (!services.inferModel) throw new Error('Model inference service unavailable')
  signal.throwIfAborted()
  return services.inferModel(directModelRequestSchema.parse(raw), signal, inspect)
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
    const active = languageModelWorkers.get(ownerId)
    if (!active) throw new Error('Local language model stopped during startup')
    return { ...result, onStopped: (listener: () => void) => {
      active.child.once('close', listener)
      active.child.once('error', listener)
      if (active.child.exitCode !== null) queueMicrotask(listener)
      return () => { active.child.removeListener('close', listener); active.child.removeListener('error', listener) }
    } }
  }, signal)
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
