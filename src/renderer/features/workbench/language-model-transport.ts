import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from 'ai'
import { getBridge } from '@/store'
import type { TranslationKey } from '@/i18n'
import type { PlaygroundConfig } from './demo-runtime'

/** Custom fetch keeps provider credentials in Electron while preserving the native AI SDK wire format. */
export function createPlaygroundFetch(getConfig: () => PlaygroundConfig, t: (key: TranslationKey) => string,
  getMemories: () => readonly string[]): typeof fetch {
  return async (_input, init) => {
    const config = { ...getConfig() }
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
        if (image && !config.images) throw new Error(t('workbench.imageUnsupported'))
        const cancel = () => { void app.cancelLanguageModel?.(id).catch(() => undefined) }
        signal?.addEventListener('abort', cancel, { once: true })
        try {
          signal?.throwIfAborted()
          writer.write({ type: 'start' })
          const result = await app.directModel!({ id, model: config.model, kind: config.kind as 'asr' | 'mt' | 'tts',
            text: user?.parts.filter(part => part.type === 'text').map(part => part.text).join('\n') ?? '',
            source: config.source, target: config.target, voice: config.voice,
            ...(audio?.type === 'file' ? { audio: audio.url } : {}), ...(image?.type === 'file' ? { image: image.url } : {}),
          })
          signal?.throwIfAborted()
          if (result.text) {
            writer.write({ type: 'text-start', id: 'result' })
            writer.write({ type: 'text-delta', id: 'result', delta: result.text })
            writer.write({ type: 'text-end', id: 'result' })
          }
          if (result.audio) writer.write({ type: 'file', mediaType: 'audio/wav', url: result.audio })
          writer.write({ type: 'finish', finishReason: 'stop' })
        } finally { signal?.removeEventListener('abort', cancel) }
      }, onError: error => error instanceof Error ? error.message : t('workbench.networkError') }) })
    }
    if (!config.model.startsWith('custom:') || !app?.streamLanguageModel || !app.onLanguageModelStream) throw new Error(t('workbench.configureFirst'))
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
          if (event.done) finish()
          else controller.enqueue(encoder.encode(event.chunk))
        })
        signal?.addEventListener('abort', abort, { once: true })
        void app.streamLanguageModel!({ id, modelId: config.model.slice(7), body, projectId: config.projectId ?? null,
          effort: ['low', 'medium', 'high'].includes(config.effort) ? config.effort as 'low' | 'medium' | 'high' : 'auto',
        }).catch(() => finish(new Error(t('workbench.networkError'))))
      },
      cancel() { closed = true; unsubscribe?.(); cancel() },
    })
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } })
  }
}
