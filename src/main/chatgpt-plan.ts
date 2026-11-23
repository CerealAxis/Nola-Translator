import { createHash, createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { z } from 'zod'
import { CHATGPT_PLAN_ENDPOINT, type ChatGptPlanRequest, type ChatGptPlanResult } from '../shared/chatgpt-plan'
import type { SecureCredentialStore } from './secure-store'
import { registerLogSecret } from './session-log'

const ISSUER = 'https://auth.openai.com'
const CALLBACK_PATH = '/auth/callback'
const PLAN_SCOPE = 'chatgpt.tokens.use.direct'
const tokenResponse = z.object({
  access_token: z.string().min(1), refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1).optional(), expires_in: z.number().positive(), scope: z.string().optional(),
})
const identity = z.object({
  iss: z.literal(ISSUER), aud: z.union([z.string(), z.array(z.string())]), azp: z.string().optional(),
  sub: z.string().min(1), nonce: z.string(), exp: z.number(),
  name: z.string().max(256).optional(), email: z.string().max(320).optional(),
})
const storedSession = z.object({
  clientId: z.string().regex(/^oaiapp_[A-Za-z0-9_-]+$/), subject: z.string(), name: z.string(), email: z.string(),
  accessToken: z.string(), refreshToken: z.string(), idToken: z.string(), expiresAt: z.number(), scopes: z.string(),
})
type Session = z.infer<typeof storedSession>

function account(session?: Session): ChatGptPlanResult {
  return session?.accessToken ? { account: { name: session.name, email: session.email,
    authorized: session.scopes.split(/\s+/).includes(PLAN_SCOPE) } } : {}
}

function nonce(): string { return randomBytes(32).toString('base64url') }

function planError(code: string): Error {
  return Object.assign(new Error(code), { code })
}

export class ChatGptPlan {
  private hostId?: Promise<string>
  private readonly authorizations = new Map<string, AbortController>()
  private readonly refreshes = new Map<string, Promise<Session>>()
  private readonly signingOut = new Set<string>()

  constructor(private readonly store: Pick<SecureCredentialStore, 'get' | 'set'>,
    private readonly openBrowser: (url: string) => Promise<void>, private readonly request: typeof fetch = fetch) {}

  private async load(id: string): Promise<Session | undefined> {
    const raw = await this.store.get('account:' + id)
    if (!raw) return
    const parsed = storedSession.safeParse(JSON.parse(raw))
    if (!parsed.success) return
    for (const value of [parsed.data.accessToken, parsed.data.refreshToken, parsed.data.idToken]) registerLogSecret(value)
    return parsed.data
  }

  private save(id: string, session: Session) {
    for (const value of [session.accessToken, session.refreshToken, session.idToken]) registerLogSecret(value)
    return this.store.set('account:' + id, JSON.stringify(session))
  }

  private async post(path: string, fields: Record<string, string>, signal?: AbortSignal) {
    return this.request(ISSUER + path, { method: 'POST', redirect: 'error', body: new URLSearchParams(fields),
      signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]) })
  }

  private async verifiedIdentity(token: string, clientId: string, expectedNonce: string, signal: AbortSignal) {
    const [header, payload, signature, extra] = token.split('.')
    if (!header || !payload || !signature || extra !== undefined) throw new Error('CHATGPT_IDENTITY_INVALID')
    const meta = z.object({ alg: z.literal('RS256'), kid: z.string() }).parse(JSON.parse(Buffer.from(header, 'base64url').toString()))
    const response = await this.request(ISSUER + '/.well-known/jwks.json', { redirect: 'error', signal })
    if (!response.ok) throw new Error('CHATGPT_IDENTITY_INVALID')
    const jwks = z.object({ keys: z.array(z.object({ kid: z.string(), kty: z.literal('RSA'), n: z.string(), e: z.string() })) })
      .parse(await response.json())
    const key = jwks.keys.find(item => item.kid === meta.kid)
    if (!key || !verify('RSA-SHA256', Buffer.from(header + '.' + payload),
      createPublicKey({ key, format: 'jwk' }), Buffer.from(signature, 'base64url'))) throw new Error('CHATGPT_IDENTITY_INVALID')
    const claims = identity.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()))
    const audiences = [claims.aud].flat()
    if (!audiences.includes(clientId) || ((claims.azp || audiences.length > 1) && claims.azp !== clientId)
      || claims.exp * 1000 <= Date.now() || claims.nonce !== expectedNonce) throw new Error('CHATGPT_IDENTITY_INVALID')
    return claims
  }

  private async signIn(id: string): Promise<ChatGptPlanResult> {
    if (this.authorizations.has(id) || this.signingOut.has(id)) throw new Error('CHATGPT_SIGN_IN_PENDING')
    const controller = new AbortController()
    this.authorizations.set(id, controller)
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(300_000)])
    const state = nonce(), verifier = nonce(), challengeNonce = nonce()
    let accept!: (params: URLSearchParams) => void
    let reject!: (reason: Error) => void
    const callback = new Promise<URLSearchParams>((resolve, failure) => { accept = resolve; reject = failure })
    void callback.catch(() => undefined)
    const abort = () => reject(planError('CHATGPT_SIGN_IN_CANCELLED'))
    signal.addEventListener('abort', abort, { once: true })
    let redirectUri = ''
    const server = createServer((incoming, outgoing) => {
      if (!redirectUri || incoming.method !== 'GET' || incoming.headers.host !== new URL(redirectUri).host
        || !incoming.url?.startsWith('/') || incoming.url.startsWith('//')) { outgoing.writeHead(404).end(); return }
      const callbackUrl = new URL(incoming.url, redirectUri)
      if (callbackUrl.pathname !== CALLBACK_PATH || callbackUrl.searchParams.get('state') !== state) {
        outgoing.writeHead(400).end(); return
      }
      outgoing.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
        .end('Return to Nola Translator to continue.')
      accept(callbackUrl.searchParams)
    })
    try {
      await this.refreshes.get(id)?.catch(() => undefined)
      const previous = await this.load(id)
      this.hostId ??= (async () => {
        const host = await this.store.get('host-id') || 'urn:uuid:' + randomUUID()
        await this.store.set('host-id', host)
        return host
      })().catch(error => { this.hostId = undefined; throw error })
      const host = await this.hostId
      signal.throwIfAborted()
      await new Promise<void>((resolve, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', resolve) })
      redirectUri = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + CALLBACK_PATH
      const params = new URLSearchParams({
        client_id: previous?.clientId ?? 'dynamic_agent_client', ext_agent_host_id: host,
        ...(previous ? (previous.idToken ? { id_token_hint: previous.idToken } : {}) : { agent_name_hint: 'Nola Translator' }),
        ...(previous && !account(previous).account?.authorized ? { prompt: 'consent' } : {}),
        response_type: 'code', resource: CHATGPT_PLAN_ENDPOINT, redirect_uri: redirectUri, state, nonce: challengeNonce,
        scope: 'openid profile email offline_access resource.invoke ' + PLAN_SCOPE,
        code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      })
      signal.throwIfAborted()
      await this.openBrowser(ISSUER + '/api/accounts/authorize?' + params)
      const result = await callback
      signal.throwIfAborted()
      if (result.has('error')) throw planError('CHATGPT_SIGN_IN_DENIED')
      const clientId = result.get('client_id') ?? previous?.clientId
      const code = result.get('code')
      if (!clientId || !/^oaiapp_[A-Za-z0-9_-]+$/.test(clientId) || (previous && clientId !== previous.clientId) || !code) {
        throw new Error('CHATGPT_SIGN_IN_INCOMPLETE')
      }
      const reply = await this.post('/api/accounts/oauth/token', { client_id: clientId, grant_type: 'authorization_code',
        code, code_verifier: verifier, redirect_uri: redirectUri, resource: CHATGPT_PLAN_ENDPOINT }, signal)
      if (!reply.ok) throw new Error('CHATGPT_SIGN_IN_FAILED')
      const tokens = tokenResponse.parse(await reply.json())
      if (!tokens.id_token) throw new Error('CHATGPT_IDENTITY_INVALID')
      const claims = await this.verifiedIdentity(tokens.id_token, clientId, challengeNonce, signal)
      if (previous && previous.subject !== claims.sub) throw new Error('CHATGPT_IDENTITY_CHANGED')
      const session: Session = { clientId, subject: claims.sub, name: claims.name ?? '', email: claims.email ?? '',
        accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? '', idToken: tokens.id_token,
        scopes: tokens.scope ?? '', expiresAt: Date.now() + tokens.expires_in * 1000 }
      signal.throwIfAborted()
      await this.save(id, session)
      return account(session)
    } finally {
      signal.removeEventListener('abort', abort)
      this.authorizations.delete(id)
      server.close()
      server.closeAllConnections()
    }
  }

  private refresh(id: string, session: Session): Promise<Session> {
    const current = this.refreshes.get(id)
    if (current) return current
    const renewing = (async () => {
      if (!session.refreshToken) throw new Error('CHATGPT_SIGN_IN_REQUIRED')
      const response = await this.post('/api/accounts/oauth/token', { grant_type: 'refresh_token',
        client_id: session.clientId, refresh_token: session.refreshToken, resource: CHATGPT_PLAN_ENDPOINT })
      if (response.status === 400 || response.status === 401) {
        await this.save(id, { ...session, accessToken: '', refreshToken: '', idToken: '', scopes: '', expiresAt: 0 })
        throw new Error('CHATGPT_SIGN_IN_REQUIRED')
      }
      if (!response.ok) throw new Error('CHATGPT_REFRESH_FAILED')
      const tokens = tokenResponse.parse(await response.json())
      const next = { ...session, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? session.refreshToken,
        scopes: tokens.scope ?? session.scopes, expiresAt: Date.now() + tokens.expires_in * 1000 }
      await this.save(id, next)
      return next
    })().finally(() => this.refreshes.delete(id))
    this.refreshes.set(id, renewing)
    return renewing
  }

  async accessToken(id: string): Promise<string> {
    if (this.signingOut.has(id)) throw new Error('CHATGPT_SIGN_IN_REQUIRED')
    let session = await this.load(id)
    if (!session?.accessToken) throw planError('CHATGPT_SIGN_IN_REQUIRED')
    if (Date.now() + 60_000 >= session.expiresAt) {
      if (this.authorizations.has(id)) throw new Error('CHATGPT_SIGN_IN_PENDING')
      session = await this.refresh(id, session)
    }
    if (!account(session).account?.authorized) throw new Error('CHATGPT_PLAN_PERMISSION_REQUIRED')
    if (this.signingOut.has(id)) throw new Error('CHATGPT_SIGN_IN_REQUIRED')
    return session.accessToken
  }

  private async disconnect(id: string): Promise<ChatGptPlanResult> {
    if (this.signingOut.has(id)) throw new Error('CHATGPT_SIGN_OUT_PENDING')
    this.signingOut.add(id)
    try {
      this.authorizations.get(id)?.abort()
      await this.refreshes.get(id)?.catch(() => undefined)
      const session = await this.load(id)
      if (!session) return { revocationConfirmed: true }
      let revocationConfirmed = !session.accessToken
      if (session.refreshToken) {
        revocationConfirmed = await this.post('/api/accounts/oauth/revoke', { client_id: session.clientId,
          token_type_hint: 'refresh_token', token: session.refreshToken }).then(reply => reply.ok, () => false)
      }
      await this.save(id, { ...session, accessToken: '', refreshToken: '', idToken: '', scopes: '', expiresAt: 0 })
      return { revocationConfirmed }
    } finally { this.signingOut.delete(id) }
  }

  async handle({ action, sourceId }: ChatGptPlanRequest): Promise<ChatGptPlanResult> {
    if (action === 'status') return account(await this.load(sourceId))
    if (action === 'sign-in') return this.signIn(sourceId)
    if (action === 'cancel') { this.authorizations.get(sourceId)?.abort(); return {} }
    if (action === 'disconnect') return this.disconnect(sourceId)
    const token = await this.accessToken(sourceId)
    const response = await this.request(CHATGPT_PLAN_ENDPOINT + '/models', { redirect: 'error',
      headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw planError(response.status === 401 ? 'CHATGPT_SIGN_IN_REQUIRED' : 'CHATGPT_MODEL_LIST_FAILED')
    const catalog = z.object({ models: z.array(z.object({
      slug: z.string().min(1).max(256), display_name: z.string().min(1).max(256), visibility: z.string(),
      context_window: z.number().int().min(256).max(10_000_000).optional().catch(undefined),
      max_output_tokens: z.number().int().positive().max(10_000_000).optional().catch(undefined),
    })) }).parse(await response.json())
    return { models: catalog.models.filter(model => model.visibility === 'list').map(model => ({
      id: model.slug, name: model.display_name, contextWindow: model.context_window, maxOutputTokens: model.max_output_tokens,
    })) }
  }
}
