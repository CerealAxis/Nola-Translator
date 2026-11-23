type ModelSpec = {
  name?: string
  limit?: { context?: number; output?: number }
  modalities?: { input?: string[] }
  reasoning_options?: { type: string; values?: string[] }[]
  canonical_model_id?: string
  status?: string
}

type Catalog = Record<string, { models?: Record<string, ModelSpec> }>
export const modelsDevUrl = 'https://models.dev/api.json'
let cached: { expires: number; request: Promise<Catalog> } | undefined

function getCatalog() {
  if (cached && cached.expires > Date.now()) return cached.request
  const request = fetch(modelsDevUrl, {
    credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10_000),
  }).then(async response => {
    if (!response.ok) throw new Error(`models.dev returned ${response.status}`)
    return await response.json() as Catalog
  }).catch((error: unknown) => {
    if (cached?.request === request) cached = undefined
    throw error
  })
  cached = { expires: Date.now() + 60 * 60 * 1000, request }
  return request
}

function defaultsOf(spec?: ModelSpec) {
  const contextWindow = spec?.limit?.context
  const maxOutputTokens = spec?.limit?.output
  if (!spec || spec.status === 'deprecated' || typeof contextWindow !== 'number' || typeof maxOutputTokens !== 'number'
    || !Number.isSafeInteger(contextWindow) || contextWindow < 256 || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1) return
  const inputs = spec.modalities?.input ?? []
  const options = spec.reasoning_options ?? []
  const effort = options.find(option => option.type === 'effort')?.values ?? []
  const toggle = options.some(option => option.type === 'toggle')
  const reasoningLevels = effort.length || !toggle ? effort : ['disabled', 'enabled']
  return {
    name: spec.name ?? '',
    contextWindow: String(contextWindow),
    maxOutputTokens: String(Math.min(contextWindow, maxOutputTokens)),
    images: inputs.includes('image'),
    video: inputs.includes('video'),
    pdf: inputs.includes('pdf'),
    reasoningLevels,
  }
}

export async function lookupModelDefaults(provider: string, modelId: string) {
  const catalog = await getCatalog()
  const providerId = ({
    'openai-responses': 'openai', 'gemini-native': 'google', gemini: 'google',
    'deepseek-responses': 'deepseek', 'deepseek-anthropic': 'deepseek',
    'minimax-chat': 'minimax-cn', 'minimax-token-plan': 'minimax-cn-coding-plan',
    'minimax-chat-global': 'minimax', 'minimax-token-plan-global': 'minimax-coding-plan',
    'xiaomi-token-plan': 'xiaomi', 'kimi-code': 'kimi-code-plan-cn', 'kimi-code-global': 'kimi-code-plan-global',
    moonshot: 'moonshotai-cn', 'moonshot-global': 'moonshotai',
    qianwen: 'alibaba-cn', qwencloud: 'alibaba', 'stepfun-global': 'stepfun-ai',
    'tencent-tokenhub-global': 'tencent-tokenhub', 'meta-model-api': 'meta',
    'aws-bedrock': 'amazon-bedrock', 'microsoft-foundry': 'azure',
  } as Record<string, string>)[provider] ?? provider
  const id = modelId.trim()
  const normalized = id.toLowerCase()
  const exact = defaultsOf(catalog[providerId]?.models?.[id])
  if (exact) return exact

  function fromQualifiedId(qualified: string) {
    const slash = qualified.indexOf('/')
    if (slash <= 0) return
    const models = catalog[qualified.slice(0, slash).toLowerCase()]?.models
    const key = qualified.slice(slash + 1)
    return defaultsOf(models?.[key] ?? models?.[key.toLowerCase()])
  }

  const qualified = fromQualifiedId(id)
  if (qualified) return qualified

  const entries = Object.entries(catalog).flatMap(([host, entry]) =>
    Object.entries(entry.models ?? {}).filter(([key, spec]) =>
      key.toLowerCase() === normalized || spec.canonical_model_id?.toLowerCase() === normalized)
      .map(([, spec]) => ({ host, spec })))
    .filter(({ spec }) => defaultsOf(spec) !== undefined)
  const scoped = entries.filter(({ host }) => host === providerId)
  if (scoped.length === 1) return defaultsOf(scoped[0].spec)
  const candidates = scoped.length ? scoped : entries
  const canonicalIds = new Set(candidates.flatMap(({ spec }) => spec.canonical_model_id ? [spec.canonical_model_id] : []))
  if (canonicalIds.size === 1) {
    const canonical = fromQualifiedId([...canonicalIds][0])
    if (canonical) return canonical
  }
  if (canonicalIds.size > 1) return

  const matches = candidates.map(({ spec }) => defaultsOf(spec))
  const first = matches[0]
  const signature = (value: typeof first) => JSON.stringify({ ...value, name: '' })
  if (first && matches.every(value => signature(value) === signature(first))) return first
}
