import { execFile, spawn } from 'node:child_process'
import type { EngineLaunchSpec } from './engine-process'
import { directModelRequestSchema, type DirectModelRequest, type DirectModelResult } from '../shared/agent-workspace'
import type { AppSettings, CredentialProvider, TranslationProvider } from '../shared/settings'
import { recognitionFieldsOf, translationOptionsOf } from '../shared/cloud-config'
import { customCredentialSlot, customModelsOf } from '../shared/custom-models'
import { INDEX_TRANSLATE_MODEL_IDS, INDEX_TRANSLATE_TRANSFORMERS_MODEL_IDS } from '../shared/index-translate'

export interface DirectModelServices {
  getSettings(): AppSettings
  getCredential(provider: CredentialProvider): Promise<string>
  directLaunch?(model: string, options?: { requiresImages?: boolean }): Promise<EngineLaunchSpec>
}

let workerQueue: Promise<unknown> = Promise.resolve()
let queuedWorkers = 0
export async function runDirectModel(services: DirectModelServices, raw: DirectModelRequest, signal: AbortSignal, inspect = false): Promise<DirectModelResult> {
  if (queuedWorkers >= 8) throw new Error('Too many pending inference tasks')
  queuedWorkers++
  const task = workerQueue.catch(() => undefined).then(() => {
    signal.throwIfAborted()
    return executeDirectModel(services, raw, signal, inspect)
  })
  workerQueue = task
  try { return await task }
  finally { queuedWorkers-- }
}

/** Per-task workers use installed runtime paths; keys travel over private stdin, never argv. */
async function executeDirectModel(services: DirectModelServices, raw: DirectModelRequest, signal: AbortSignal, inspect: boolean): Promise<DirectModelResult> {
  const request = directModelRequestSchema.parse(raw)
  if (!services.directLaunch) throw new Error('Direct model runtime unavailable')
  const settings = services.getSettings()
  const resourceId = request.model.startsWith('resource:') ? request.model.slice(9) : undefined
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
    child.stdin.end(JSON.stringify({ ...request, resourceId, config, inspect }))
  })
}
