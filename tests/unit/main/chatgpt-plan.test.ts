import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { streamText } from 'ai'
import { ChatGptPlan } from '../../../src/main/chatgpt-plan'
import { createGatewayLanguageModel } from '../../../src/main/gateway-language-model'
import { probeCloudLanguageModel } from '../../../src/main/cloud-model-tools'
import { CHATGPT_PLAN_ENDPOINT } from '../../../src/shared/chatgpt-plan'
import { DEFAULT_SETTINGS, type AppSettings } from '../../../src/shared/settings'
import { buildConfiguredCloudModels } from '../../../src/shared/model-availability'
import { customCredentialSlot } from '../../../src/shared/custom-models'
import type { CredentialProvider } from '../../../src/shared/settings'

afterEach(() => vi.unstubAllGlobals())

it('exchanges a verified loopback authorization, lists supported models and revokes the session', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const values = new Map<string, string>()
  const id = 'provider_0123456789abcdef01234567'
  const clientId = 'oaiapp_test'
  let authorize!: URL
  const request = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/jwks.json')) {
      return Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test-key' }] })
    }
    if (url.endsWith('/oauth/token')) {
      const fields = new URLSearchParams(String(init?.body))
      expect(fields.get('client_id')).toBe(clientId)
      expect(fields.get('redirect_uri')).toBe(authorize.searchParams.get('redirect_uri'))
      expect(fields.get('resource')).toBe(CHATGPT_PLAN_ENDPOINT)
      expect(createHash('sha256').update(fields.get('code_verifier')!).digest('base64url')).toBe(authorize.searchParams.get('code_challenge'))
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
      const claims = encode({ iss: 'https://auth.openai.com', aud: clientId, sub: 'account',
        exp: Date.now() / 1000 + 60, nonce: authorize.searchParams.get('nonce'), email: 'user@example.test' })
      const input = encode({ alg: 'RS256', kid: 'test-key' }) + '.' + claims
      return Response.json({ access_token: 'account-access', refresh_token: 'refresh-secret', expires_in: 600,
        scope: 'resource.invoke chatgpt.tokens.use.direct',
        id_token: input + '.' + sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url') })
    }
    if (url === CHATGPT_PLAN_ENDPOINT + '/models') {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer account-access')
      return Response.json({ models: [{ visibility: 'list', slug: 'model', display_name: 'Model' },
        { visibility: 'hidden', slug: 'hidden', display_name: 'Hidden' }] })
    }
    if (url.endsWith('/oauth/revoke')) return new Response(null, { status: 200 })
    throw new Error('unexpected request')
  })
  const plan = new ChatGptPlan({
    get: async key => values.get(key) ?? '',
    set: async (key, value) => { values.set(key, value) },
  }, async url => {
    authorize = new URL(url)
    expect(authorize.searchParams.get('client_id')).toBe('dynamic_agent_client')
    const callback = new URL(authorize.searchParams.get('redirect_uri')!)
    callback.search = new URLSearchParams({ client_id: clientId, state: 'invalid', code: 'code' }).toString()
    expect((await fetch(callback)).status).toBe(400)
    callback.searchParams.set('state', authorize.searchParams.get('state')!)
    expect((await fetch(callback)).status).toBe(200)
  }, request)

  expect(await plan.handle({ action: 'sign-in', sourceId: id })).toEqual({ account: { name: '', email: 'user@example.test', authorized: true } })
  expect(await plan.handle({ action: 'models', sourceId: id })).toMatchObject({ models: [{ id: 'model', name: 'Model' }] })
  expect(await plan.handle({ action: 'disconnect', sourceId: id })).toEqual({ revocationConfirmed: true })
  await expect(plan.accessToken(id)).rejects.toThrow('CHATGPT_SIGN_IN_REQUIRED')
})

it('uses the ChatGPT token on the fixed Responses route without storing the request', async () => {
  const sourceId = 'provider_0123456789abcdef01234567'
  const profile = { id: 'chatgpt-profile', name: 'ChatGPT model', model: 'plan-model',
    endpoint: 'https://untrusted.example/v1', apiFormat: 'chat-responses' as const, contextWindow: 32768, maxOutputTokens: 512, languages: ['en'] }
  const settings = { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, customModels: [profile] },
    modelWorkspace: { localSources: {}, connections: [{ id: sourceId, service: 'chatgpt-plan', capability: 'LLM',
      name: 'ChatGPT', protocol: 'chat-responses', endpoint: CHATGPT_PLAN_ENDPOINT, workspace: '', region: '',
      models: [{ id: profile.model, name: profile.name, enabled: true, profileId: profile.id }] }] },
  } as AppSettings
  const credentialFlags = {} as Record<CredentialProvider, boolean>
  expect(buildConfiguredCloudModels(settings, credentialFlags).llm).toEqual([])
  credentialFlags[customCredentialSlot(sourceId)] = true
  const catalog = buildConfiguredCloudModels(settings, credentialFlags)
  expect(catalog.llm).toContainEqual(expect.objectContaining({ binding: 'custom:' + profile.id }))
  expect(catalog.mt).not.toContainEqual(expect.objectContaining({ binding: 'mt-custom:' + profile.id }))
  const getCredential = vi.fn(async () => 'wrong-key')
  const getChatGptPlanToken = vi.fn(async () => 'plan-token')
  const item = { type: 'message', id: 'msg_1' }
  const events = [
    { type: 'response.output_item.added', output_index: 0, item },
    { type: 'response.output_text.delta', output_index: 0, item_id: item.id, delta: 'Hello' },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: {} },
  ]
  const fetchPlan = vi.fn<typeof fetch>().mockResolvedValue(new Response(
    events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''),
    { headers: { 'Content-Type': 'text/event-stream' } },
  ))
  vi.stubGlobal('fetch', fetchPlan)
  const lease = await createGatewayLanguageModel({ getSettings: () => settings, getCredential, getChatGptPlanToken },
    'custom:' + profile.id, new AbortController().signal)
  const stream = streamText({ model: lease.model('disabled'), prompt: 'hello', maxRetries: 0, onError: () => {} })
  await expect(stream.text).resolves.toBe('Hello')

  expect(getCredential).not.toHaveBeenCalled()
  expect(getChatGptPlanToken).toHaveBeenCalledWith(sourceId)
  const [target, init] = fetchPlan.mock.calls[0]
  expect(target).toBe(CHATGPT_PLAN_ENDPOINT + '/responses')
  expect(init?.redirect).toBe('error')
  expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer plan-token')
  expect(JSON.parse(String(init?.body))).toMatchObject({ model: profile.model, store: false, stream: true })
})

it('probes a ChatGPT plan model with its account token and a streaming request', async () => {
  const sourceId = 'provider_0123456789abcdef01234567'
  const profile = { id: 'plan-profile', name: 'Plan model', model: 'plan-model', endpoint: CHATGPT_PLAN_ENDPOINT,
    apiFormat: 'chat-responses' as const, contextWindow: 32768, maxOutputTokens: 512, languages: ['en'] }
  const settings = { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, customModels: [profile] },
    modelWorkspace: { localSources: {}, connections: [{ id: sourceId, service: 'chatgpt-plan', capability: 'LLM',
      name: 'ChatGPT', protocol: 'chat-responses', endpoint: CHATGPT_PLAN_ENDPOINT, workspace: '', region: '',
      models: [{ id: profile.model, name: profile.name, enabled: true, profileId: profile.id }] }] } } as AppSettings
  const getCredential = vi.fn(async () => '')
  const getChatGptPlanToken = vi.fn(async () => 'plan-token')
  const event = { type: 'response.completed', response: {} }
  const fetchPlan = vi.fn<typeof fetch>().mockResolvedValue(new Response('data: ' + JSON.stringify(event) + '\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } }))
  vi.stubGlobal('fetch', fetchPlan)
  const controller = new AbortController()
  const runtime = await createGatewayLanguageModel({ getSettings: () => settings, getCredential, getChatGptPlanToken },
    'custom:' + profile.id, controller.signal)
  const release = vi.fn()
  const acquire = vi.fn(async () => ({ ...runtime, signal: controller.signal, release }))

  await probeCloudLanguageModel('custom:' + profile.id, settings, getCredential, acquire, controller.signal)
  expect(getCredential).not.toHaveBeenCalled()
  expect(getChatGptPlanToken).toHaveBeenCalledWith(sourceId)
  expect(JSON.parse(String(fetchPlan.mock.calls[0][1]?.body))).toMatchObject({ model: profile.model, store: false, stream: true })
  expect(release).toHaveBeenCalledWith(undefined)
  fetchPlan.mockResolvedValueOnce(Response.json({ error: { message: 'Unauthorized' } }, { status: 401 }))
  await expect(probeCloudLanguageModel('custom:' + profile.id, settings, getCredential, acquire, controller.signal))
    .rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' })
  expect(release).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'AUTHENTICATION_FAILED' }))
})
