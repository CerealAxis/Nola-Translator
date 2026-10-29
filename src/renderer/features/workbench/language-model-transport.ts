import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from 'ai'
import { getBridge } from '@/store'
import type { TranslationKey } from '@/i18n'
import type { PlaygroundModel } from './installed-models'
import type { PlaygroundConfig } from './demo-runtime'
import { extractVideoAudio, pcmWavData } from './audio-attachment'

function fallbackErrorKey(config: PlaygroundConfig): TranslationKey {
  if (config.kind === 'tts') return 'workbench.localTtsError'
  if (config.kind === 'asr') return config.model.startsWith('cloud:') ? 'workbench.serviceError' : 'workbench.localAsrError'
  if (config.kind === 'mt') return config.model.startsWith('resource:') ? 'workbench.localMtError' : 'workbench.serviceError'
  if (config.model.startsWith('resource:')) return 'workbench.localLlmError'
  return 'workbench.networkError'
}

/** Custom fetch keeps provider credentials in Electron while preserving the native AI SDK wire format. */
export function createPlaygroundFetch(getConfig: () => PlaygroundConfig, t: (key: TranslationKey) => string,
  getMemories: () => readonly string[], getModels?: () => readonly PlaygroundModel[]): typeof fetch {
  return async (_input, init) => {
    const config = { ...getConfig() }
    if (getModels && !getModels().some(model => model.id === config.model && model.kind === config.kind)) {
      throw new Error(t('workbench.noModels'))
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as { messages: UIMessage[]; system?: string }
    const signal = init?.signal
    const app = getBridge()?.app
    if (config.kind !== 'llm') {
      if (!app?.directModel) throw new Error(t('workbench.runtimeUnavailable'))
      const id = crypto.randomUUID()
      return createUIMessageStreamResponse({ stream: createUIMessageStream({ execute: async ({ writer }) => {
        const user = [...body.messages].reverse().find(message => message.role === 'user')
        const image = user?.parts.find(part => part.type === 'file' && part.mediaType.startsWith('image/'))
        const audio = user?.parts.find(part => part.type === 'file' && part.mediaType.startsWith('audio/'))
        const video = user?.parts.find(part => part.type === 'file' && part.mediaType.startsWith('video/'))
        if (config.kind === 'asr' && !audio && !video) throw new Error(t('workbench.asrNeedsAudio'))
        if (image && !config.images) throw new Error(t('workbench.imageUnsupported'))
        const cancel = () => { void app.cancelLanguageModel?.(id).catch(() => undefined) }
        signal?.addEventListener('abort', cancel, { once: true })
        let activeStep: string | undefined
        const beginStep = (toolName: string, input: Record<string, string>) => {
          activeStep = crypto.randomUUID()
          writer.write({ type: 'tool-input-available', toolCallId: activeStep, toolName, input, providerExecuted: true, dynamic: true })
        }
        const finishStep = (output: string) => {
          if (activeStep) writer.write({ type: 'tool-output-available', toolCallId: activeStep, output, providerExecuted: true, dynamic: true })
          activeStep = undefined
        }
        try {
          signal?.throwIfAborted()
          writer.write({ type: 'start' })
          let recognitionAudio = audio?.type === 'file' ? audio.url : undefined
          if (config.kind === 'asr') {
            const media = video?.type === 'file' ? video : audio?.type === 'file' ? audio : undefined
            beginStep(video ? 'nola_extract_audio' : 'nola_prepare_audio', { filename: media?.filename ?? '' })
            const input = video?.type === 'file'
              ? await extractVideoAudio(await (await fetch(video.url, { signal })).blob(), signal ?? undefined, key => t(`workbench.${key}`))
              : recognitionAudio!
            recognitionAudio = await pcmWavData(input, signal ?? undefined)
            finishStep(t('workbench.audioPrepared'))
            beginStep('nola_transcribe_audio', { model: config.model })
          } else if (config.kind === 'mt') beginStep(image ? 'nola_translate_image' : 'nola_translate_text', { model: config.model, target: config.target })
          else if (config.kind === 'tts') beginStep('nola_synthesize_speech', { model: config.model, voice: config.voice })
          const result = await app.directModel!({ id, model: config.model, kind: config.kind as 'asr' | 'mt' | 'tts',
            text: user?.parts.filter(part => part.type === 'text').map(part => part.text).join('\n') ?? '',
            source: config.source, target: config.target, voice: config.voice,
            ...(recognitionAudio ? { audio: recognitionAudio } : {}), ...(image?.type === 'file' ? { image: image.url } : {}),
          })
          signal?.throwIfAborted()
          if (config.kind === 'tts' && !result.audio) throw new Error(t('workbench.noAudioResult'))
          finishStep(t(config.kind === 'asr' ? 'workbench.transcriptionCompleted' : config.kind === 'mt' ? 'workbench.translationCompleted' : 'workbench.synthesisCompleted'))
          const text = result.text?.trim() || (!result.audio ? t(config.kind === 'asr' ? 'workbench.noSpeechDetected' : 'workbench.emptyResult') : '')
          if (text) {
            writer.write({ type: 'text-start', id: 'result' })
            writer.write({ type: 'text-delta', id: 'result', delta: text })
            writer.write({ type: 'text-end', id: 'result' })
          }
          if (result.audio) writer.write({ type: 'file', mediaType: 'audio/wav', url: result.audio })
          writer.write({ type: 'finish', finishReason: 'stop' })
        } catch (error) {
          if (activeStep && !signal?.aborted) writer.write({ type: 'tool-output-error', toolCallId: activeStep,
            errorText: error instanceof Error ? error.message : t(fallbackErrorKey(config)), providerExecuted: true, dynamic: true })
          throw error
        } finally { signal?.removeEventListener('abort', cancel) }
      }, onError: error => error instanceof Error ? error.message : t(fallbackErrorKey(config)) }) })
    }
    const local = config.model.startsWith('resource:')
    if ((!local && !config.model.startsWith('custom:')) || !app?.streamLanguageModel || !app.onLanguageModelStream) throw new Error(t('workbench.configureFirst'))
    signal?.throwIfAborted()
    const id = crypto.randomUUID()
    const encoder = new TextEncoder()
    body.system = [body.system, ...getMemories()].filter(Boolean).join('\n')
    let unsubscribe: (() => void) | undefined
    let closed = false
    const cancel = () => { void app.cancelLanguageModel?.(id).catch(() => undefined) }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const abort = () => { cancel(); finish(new DOMException('Aborted', 'AbortError')) }
        const finish = (error?: Error) => {
          if (closed) return
          closed = true
          unsubscribe?.()
          signal?.removeEventListener('abort', abort)
          if (error) controller.error(error)
          else controller.close()
        }
        unsubscribe = app.onLanguageModelStream!(event => {
          if (event.id !== id || closed) return
          if (event.audioPreparation) {
            const preparation = event.audioPreparation
            void (async () => {
              if (!app.resolveLanguageModelAudio) throw new Error(t('workbench.runtimeUnavailable'))
              try {
                if (!/^data:(audio|video)\//.test(preparation.url)) throw new Error(t('workbench.asrNeedsAudio'))
                const input = preparation.mimeType.startsWith('video/')
                  ? await extractVideoAudio(await (await fetch(preparation.url, { signal })).blob(), signal ?? undefined, key => t(`workbench.${key}`))
                  : preparation.url
                const audio = await pcmWavData(input, signal ?? undefined)
                if (!closed) await app.resolveLanguageModelAudio({ id: preparation.id, ok: true, audio })
              } catch (error) {
                if (!closed && !signal?.aborted) await app.resolveLanguageModelAudio({ id: preparation.id, ok: false,
                  error: error instanceof Error ? error.message : t('workbench.mediaPreparationError') })
              }
            })().catch(error => { cancel(); finish(error instanceof Error ? error : new Error(t('workbench.mediaPreparationError'))) })
            return
          }
          if (event.done) finish()
          else controller.enqueue(encoder.encode(event.chunk))
        })
        signal?.addEventListener('abort', abort, { once: true })
        void app.streamLanguageModel!({ id, source: local ? 'local' : 'custom', modelId: config.model.slice(local ? 9 : 7), body, projectId: config.projectId ?? null,
          effort: ['low', 'medium', 'high'].includes(config.effort) ? config.effort as 'low' | 'medium' | 'high' : 'auto',
        }).catch(error => finish(error instanceof Error ? error : new Error(t(fallbackErrorKey(config)))))
      },
      cancel() { closed = true; unsubscribe?.(); cancel() },
    })
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } })
  }
}
