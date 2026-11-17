import { afterEach, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { generateText } from 'ai'
import { ComicTaskRunner, type ComicRequest } from '../../../src/main/comic-jobs'
import { parseComicModelOutput, translateComicPage } from '../../../src/main/comic-model'
import { comicConfigSchema, comicMutationSchema, comicRunSchema } from '../../../src/shared/comic'
import { emptyGlossary } from '../../../src/shared/glossary'
import { emptyWordRules } from '../../../src/shared/word-rules'
import type { ModelGateway } from '../../../src/main/model-gateway'

vi.mock('ai', () => ({ generateText: vi.fn() }))
afterEach(() => { vi.restoreAllMocks(); vi.mocked(generateText).mockReset() })

it('stops while the backend has not returned a page claim', async () => {
  let entered = false
  const request: ComicRequest = async <T>(path: string, _body?: unknown, signal?: AbortSignal) => {
    if (path !== '/jobs/claim') return {} as T
    entered = true
    return new Promise<T>((_resolve, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }))
  }
  const runner = new ComicTaskRunner(request, async () => [], () => {})
  runner.wake()
  await vi.waitFor(() => expect(entered).toBe(true))
  await runner.stop()
})

it('rejects missing, duplicate and foreign IDs in model results', () => {
  const id = randomUUID(), other = randomUUID()
  expect(parseComicModelOutput(`[{"id":"${id}","text":"译文"}]`, [id])).toEqual([{ id, text: '译文' }])
  expect(() => parseComicModelOutput('[]', [id])).toThrow()
  expect(() => parseComicModelOutput(JSON.stringify([{ id, text: '' }, { id, text: '' }]), [id, other])).toThrow()
  expect(() => parseComicModelOutput(JSON.stringify([{ id: other, text: '' }]), [id])).toThrow()
  expect(() => parseComicModelOutput('[{"text":"private source":}]', [id])).toThrow('comicInvalidModelResult')
})

it('validates independent pipeline settings and bounded mutation targets', () => {
  const config = comicConfigSchema.parse({ normalModel: 'cloud:google', visualModel: 'custom:vision', proofModel: 'custom:proof' })
  expect(config.normalModel).not.toBe(config.visualModel)
  expect(() => comicConfigSchema.parse({ ...config, rounds: 4 })).toThrow()
  expect(() => comicRunSchema.parse({ projectId: randomUUID(), expectedRevision: 0, kind: 'normal', pageIds: [] })).toThrow()
  expect(() => comicMutationSchema.parse({ projectId: randomUUID(), expectedRevision: 0, operationId: randomUUID(), command: { action: 'savePages', pages: [] } })).toThrow()
})

it('protects source fragments and budgets glossary terms per region on long pages', async () => {
  const glossary = emptyGlossary(), words = emptyWordRules()
  glossary.libraries = [{ id: randomUUID(), name: 'terms', description: '', enabled: true, scope: { mode: 'global' }, entries: [
    { id: randomUUID(), source: 'Nola', target: '诺拉', targetLanguage: '*', caseSensitive: true, enabled: true },
    { id: randomUUID(), source: 'hello', target: '你好', targetLanguage: '*', caseSensitive: false, enabled: true },
  ] }]
  words.libraries = [{ id: randomUUID(), name: 'keep', kind: 'preserve', enabled: true, scope: { mode: 'global' }, entries: [{ id: randomUUID(), text: 'Nola', language: '*', caseSensitive: true, enabled: true }] }]
  const infer = vi.fn(async (input: { text: string; glossary: unknown[] }) => {
    expect(input.glossary).toHaveLength(1)
    expect(input.text).not.toContain('Nola')
    return { text: input.text.replace('hello', '你好') }
  })
  const gateway = { snapshotWithCatalog: async () => ({ availableModels: { mt: [{ binding: 'cloud:google' }] } }), infer } as unknown as ModelGateway
  const input = { bookId: randomUUID(), kind: 'normal' as const, config: comicConfigSchema.parse({ normalModel: 'cloud:google' }), page: { regions: Array.from({ length: 300 }, () => ({ id: randomUUID(), sourceText: 'hello Nola', targetText: null, x: 0, y: 0, width: 100, height: 50,
    confidence: null, locked: false, ignored: false, style: { fontSize: 20, color: '#222222', direction: 'horizontal' as const, align: 'center' as const }, qa: [] })) } }
  const result = await translateComicPage({ gateway, glossary: async () => glossary, wordRules: async () => words }, input, new AbortController().signal)
  expect(result).toHaveLength(300)
  expect(result.every(item => item.text === '你好 Nola')).toBe(true)
  expect(infer).toHaveBeenCalledTimes(300)
})

it('rejects changed model parameters before sending a queued translation', async () => {
  const gateway = {} as ModelGateway
  await expect(translateComicPage({ gateway, glossary: async () => emptyGlossary(), wordRules: async () => emptyWordRules(), modelConfigSignature: () => 'new' }, {
    bookId: randomUUID(), kind: 'normal', config: comicConfigSchema.parse({}), page: { regions: [] }, modelConfigSignature: 'original',
  }, new AbortController().signal)).rejects.toThrow('modelConfigChanged')
})

it('cancels model loading promptly and releases a lease that arrives afterwards', async () => {
  const controller = new AbortController(), release = vi.fn()
  let finish!: (lease: unknown) => void
  const gateway = { snapshotWithCatalog: async () => ({ availableModels: { llm: [{ binding: 'custom:model' }] } }),
    acquireLanguageModel: () => new Promise(resolve => { finish = resolve }) } as unknown as ModelGateway
  const pending = translateComicPage({ gateway, glossary: async () => emptyGlossary(), wordRules: async () => emptyWordRules() }, {
    bookId: randomUUID(), kind: 'visual', config: comicConfigSchema.parse({ visualModel: 'custom:model' }),
    page: { regions: [{ id: randomUUID(), sourceText: 'hello', targetText: null, locked: false, ignored: false,
      x: 0, y: 0, width: 100, height: 50, confidence: null, qa: [],
      style: { fontSize: 20, color: '#222222', direction: 'horizontal', align: 'center' } }] },
  }, controller.signal)
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  controller.abort(new Error('cancelled'))
  await expect(pending).rejects.toThrow('cancelled')
  finish({ release })
  await vi.waitFor(() => expect(release).toHaveBeenCalledOnce())
})

it.each(['normal', 'translate', 'visual', 'proof'] as const)('rejects a model from the wrong capability for %s', async kind => {
  const usesLlm = kind === 'visual' || kind === 'proof'
  const binding = usesLlm ? 'cloud:google' : 'custom:model'
  const gateway = { snapshotWithCatalog: async () => ({ availableModels: {
    llm: [{ binding: 'custom:model' }], mt: [{ binding: 'cloud:google', images: true }],
  } }), infer: vi.fn(), acquireLanguageModel: vi.fn() } as unknown as ModelGateway
  await expect(translateComicPage({ gateway, glossary: async () => emptyGlossary(), wordRules: async () => emptyWordRules() }, {
    bookId: randomUUID(), kind, config: comicConfigSchema.parse({ normalModel: binding, visualModel: binding, proofModel: binding }),
    page: { regions: [{ id: randomUUID(), sourceText: 'hello', targetText: null, locked: false, ignored: false,
      x: 0, y: 0, width: 100, height: 50, confidence: null, qa: [],
      style: { fontSize: 20, color: '#222222', direction: 'horizontal', align: 'center' } }] },
  }, new AbortController().signal)).rejects.toThrow('modelUnavailable')
  expect(gateway.infer).not.toHaveBeenCalled()
  expect(gateway.acquireLanguageModel).not.toHaveBeenCalled()
})

it.each(['visual', 'proof'] as const)('uses a text language model without sending an image for %s', async kind => {
  const id = randomUUID(), release = vi.fn()
  vi.mocked(generateText).mockResolvedValue({ text: JSON.stringify([{ id, text: '你好' }]) } as Awaited<ReturnType<typeof generateText>>)
  const gateway = { snapshotWithCatalog: async () => ({ availableModels: { llm: [{ binding: 'custom:model', images: false }] } }),
    acquireLanguageModel: vi.fn(async () => ({ model: () => ({}), profile: { maxOutputTokens: 512 }, signal: new AbortController().signal, release })), infer: vi.fn() } as unknown as ModelGateway
  const output = await translateComicPage({ gateway, glossary: async () => emptyGlossary(), wordRules: async () => emptyWordRules() }, {
    bookId: randomUUID(), kind, sourceImage: 'unused image',
    config: comicConfigSchema.parse({ visualModel: 'custom:model', proofModel: 'custom:model', rounds: 1 }),
    page: { regions: [{ id, sourceText: 'hello', targetText: null, locked: false, ignored: false,
      x: 0, y: 0, width: 100, height: 50, confidence: null, qa: [],
      style: { fontSize: 20, color: '#222222', direction: 'horizontal', align: 'center' } }] },
  }, new AbortController().signal)
  expect(output).toEqual([{ id, text: '你好' }])
  expect(typeof vi.mocked(generateText).mock.calls[0][0].messages?.[0].content).toBe('string')
  expect(gateway.infer).not.toHaveBeenCalled()
  expect(release).toHaveBeenCalledOnce()
})

it('publishes only the matching claimed attempt and drains subsequent pages', async () => {
  const jobId = randomUUID(), pageId = randomUUID(), attemptId = randomUUID()
  const calls: { path: string; body: unknown }[] = []
  let claims = 0
  const request: ComicRequest = async <T>(path: string, body?: unknown) => {
    calls.push({ path, body })
    if (path === '/jobs/claim') return (claims++ === 0 ? { jobId, pageId, attemptId } : null) as T
    if (path.endsWith('/prepare')) return { kind: 'normal', page: { regions: [] }, config: comicConfigSchema.parse({}) } as T
    return {} as T
  }
  const translate = vi.fn(async () => [{ id: randomUUID(), text: 'done' }])
  const changed = vi.fn()
  const runner = new ComicTaskRunner(request, translate, changed)
  runner.wake()
  await vi.waitFor(() => expect(claims).toBe(2))
  const completion = calls.find(call => call.path.endsWith('/complete'))!
  expect(completion.body).toMatchObject({ pageId, attemptId, translations: expect.any(Array) })
  expect(completion.body).not.toHaveProperty('jobId')
  expect(changed).toHaveBeenCalledTimes(2)
  await runner.stop()
})

it('cancels an in-flight model request and records failure without a translated result', async () => {
  const jobId = randomUUID(), pageId = randomUUID(), attemptId = randomUUID()
  const complete = vi.fn()
  let claimed = false
  const request: ComicRequest = async <T>(path: string, body?: unknown) => {
    if (path === '/jobs/claim') { if (claimed) return null as T; claimed = true; return { jobId, pageId, attemptId } as T }
    if (path.endsWith('/prepare')) return { kind: 'normal' } as T
    if (path.endsWith('/complete')) complete(body)
    return {} as T
  }
  let entered = false
  const runner = new ComicTaskRunner(request, async (_input, signal) => {
    entered = true
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
  }, () => {})
  runner.wake()
  await vi.waitFor(() => expect(entered).toBe(true))
  runner.cancel(jobId)
  await vi.waitFor(() => expect(complete).toHaveBeenCalledWith({ pageId, attemptId, error: 'cancelled' }))
  await runner.stop()
})
