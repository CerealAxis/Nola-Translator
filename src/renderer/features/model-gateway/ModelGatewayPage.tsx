import { useEffect, useState } from 'react'
import { Activity, CircleHelp, Copy, Eye, EyeOff, Mic, Languages, RotateCcw, Volume2, Bot } from 'lucide-react'
import { useI18n } from '@/i18n'
import { getBridge, stores, updateSettings, useStore } from '@/store'
import { useRoute } from '@/routes'
import { requestFeatureStart } from '@/components/primitives/FeatureActivityNotice'
import { PageHeader } from '@/components/primitives'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { GatewayCapability, ModelGatewaySnapshot } from '../../../shared/model-gateway'
import { bindingIsLocal, normalizeModelBinding } from '../../../shared/model-gateway'
import { defaultModelBinding, modelEnablePatch } from '../../../shared/model-policy'
import { languageName } from '../../../shared/languages'
import { useModelOptions } from '@/model-options'
import { customModelsOf } from '../../../shared/custom-models'
import { cloudModelsOf } from '../../../shared/cloud-models'
import { gatewayBindingPatch } from '@/available-models'
import { installedPlaygroundModels } from '../workbench/installed-models'
import { isModelReady } from '../../../shared/model-capabilities'
import { supportsSelectedEngine, modelEngines } from '../../../shared/model-engines'
import { isEngineAvailable } from '../models/engine-availability'
import './model-gateway.css'

const CAPABILITIES: GatewayCapability[] = ['asr', 'mt', 'tts', 'llm']
const REQUEST_ICONS = { asr: Mic, mt: Languages, tts: Volume2, llm: Bot }

export function ModelGatewayPage() {
  const { t, language } = useI18n()
  const { navigate } = useRoute()
  const settings = useStore(stores.settings, state => state.settings)
  const modelOptions = useModelOptions()
  const runtimes = useStore(stores.settings, state => state.runtimes)
  const resources = useStore(stores.models, state => state.resources)
  const credentials = useStore(stores.models, state => state.credentials)
  const configuredCloudModels = settings ? cloudModelsOf(settings, credentials).filter(model => model.ready) : []
  const api = getBridge()?.gateway
  const [snapshot, setSnapshot] = useState<ModelGatewaySnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const refresh = async () => {
    if (!api) return
    try { setSnapshot(await api.snapshot()); setLoadFailed(false) }
    catch (error) { console.error('[gateway.snapshot]', error); setLoadFailed(true) }
  }
  useEffect(() => {
    if (!api) return
    let alive = true
    const unsubscribe = api.onChanged(value => { if (alive) setSnapshot(value) })
    void api.snapshot().then(value => { if (alive) setSnapshot(value) }).catch(error => { console.error('[gateway.snapshot]', error); if (alive) setLoadFailed(true) })
    return () => { alive = false; unsubscribe() }
  }, [api])
  if (!api) return <Alert><AlertDescription>{t('gateway.unavailable')}</AlertDescription></Alert>
  if (!settings || !snapshot) return <div className="model-gateway-page"><PageHeader className="nola-page-heading" title={t('gateway.title')} /><p>{t(loadFailed ? 'gateway.actionFailed' : 'common.loading')}</p>{loadFailed ? <Button onClick={() => void refresh()}>{t('gateway.refresh')}</Button> : null}</div>
  const config = settings.modelGateway
  // Gateway candidates are ready local models and usable cloud connections; selection enables them.
  const localChoices = installedPlaygroundModels(resources, settings, credentials, t).filter(model => {
    if (!bindingIsLocal(model.id)) return false
    const resource = resources.find(item => item.resourceId === model.id.slice(9))
    if (!resource || !(resource.kind === 'ttsModel' ? resource.installed : isModelReady(resource))) return false
    const engine = modelEngines(resource)[0]
    return supportsSelectedEngine(resource, settings.compute, resource.resourceId)
      && (!engine || !runtimes?.local || isEngineAvailable(engine, runtimes.local))
  })
  const cloudChoices: Array<{ id: string; name: string; kind: GatewayCapability }> = []
  configuredCloudModels.forEach(model => {
    if (model.profile) {
      cloudChoices.push(
        { id: `mt-custom:${model.profile.id}`, name: model.profile.name, kind: 'mt' },
        { id: `custom:${model.profile.id}`, name: model.profile.name, kind: 'llm' },
      )
      return
    }
    const name = model.id === 'aliyun' ? t('modelsSettingsUi.aliyunAsr')
      : model.id === 'minimax' ? t('settings.providerMiniMax')
      : model.id === 'microsoft' ? t('settings.providerMicrosoft')
      : model.id === 'mymemory' ? t('settings.providerMyMemory')
      : model.id === 'google' ? t('settings.providerGoogle')
      : model.id === 'index-translate' ? t('settings.providerIndexTranslate')
      : ''
    if (!name || model.id === 'recognition') return
    cloudChoices.push({ id: `cloud:${model.id}`, name, kind: model.kind === 'recognitionModel' ? 'asr' : 'mt' })
  })
  const choices = CAPABILITIES.flatMap(kind => {
    const options = [
      ...localChoices.filter(model => model.kind === kind),
      ...cloudChoices.filter(model => model.kind === kind),
    ]
    const seen = new Set<string>()
    return options.filter(option => !seen.has(option.id) && !!seen.add(option.id))
  })
  const profiles = customModelsOf(settings.translation)
  /**
   * The binding the gateway loads for a capability. An empty stored field falls back to what the
   * business settings name, so a profile written before the gateway owned loading keeps working.
   */
  const gatewayBinding = (kind: GatewayCapability) => normalizeModelBinding(kind, kind === 'llm' ? config.llmModel
    : kind === 'asr' ? config.asrModel : kind === 'tts' ? config.ttsModel : config.mtModel)
    || defaultModelBinding(settings, kind)
  const fallbackBinding = () => normalizeModelBinding('mt', config.mtFallbackModel)
  const targetLanguages = [...new Set([config.targetLanguage, ...modelOptions.targetLanguages.filter(code => code !== 'none')])]
  const running = snapshot.state === 'running' || snapshot.state === 'starting'
  const changing = busy || snapshot.state === 'starting' || snapshot.state === 'stopping'
  const perform = async (action: () => Promise<unknown>, operation: 'action' | 'runtime' | 'settings' = 'action') => {
    setBusy(true)
    try { await action() } catch (error) {
      console.error('[gateway.action]', error)
      const current = operation === 'runtime' ? await api.snapshot().catch(() => null) : null
      if (operation === 'settings' || !current || (current.state !== 'failed' && !Object.values(current.services).some(service => service.state === 'failed'))) notifyError(t('gateway.actionFailed'), { cause: error })
    }
    finally { setBusy(false) }
  }
  const copy = (value: string) => perform(async () => { await navigator.clipboard.writeText(value); notifySuccess(t('gateway.copied')) })
  /** Point a capability at a model: the gateway field, never the business session default. */
  const selectModel = async (kind: GatewayCapability, model: string) => {
    if (model === '__disabled__') {
      await updateSettings({ modelGateway: { [`${kind}Model`]: '', [kind]: false } })
      return
    }
    if (!choices.some(choice => choice.kind === kind && choice.id === model)) return
    const patch = gatewayBindingPatch(kind, model)
    const enabled = modelEnablePatch(settings, kind, model, true)
    await updateSettings({ ...patch, ...enabled, modelGateway: { ...patch.modelGateway, [kind]: true } })
  }
  const selectFallback = async (model: string) => {
    await updateSettings({ modelGateway: { mtFallbackModel: model === 'none' ? '' : normalizeModelBinding('mt', model) } })
  }
  const address = snapshot.state === 'stopped' ? `http://127.0.0.1:${config.port}/v1` : snapshot.address.replace('://0.0.0.0', '://127.0.0.1') || `http://127.0.0.1:${config.port}/v1`
  const example = (kind: GatewayCapability) => {
    const base = address.replace(/\/v1\/?$/, '').replace(/\/$/, '')
    if (kind === 'llm') return `curl ${base}/v1/chat/completions \\\n  -H "Authorization: Bearer YOUR_API_KEY" -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ model: 'nola-llm', messages: [{ role: 'user', content: 'Hello' }], stream: true })}'`
    if (kind === 'asr') return `curl ${base}/v1/audio/transcriptions \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F "model=nola-asr" -F "file=@audio.wav"`
    if (kind === 'tts') return `curl ${base}/v1/audio/speech \\\n  -H "Authorization: Bearer YOUR_API_KEY" -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ model: 'nola-tts', input: 'Hello', voice: settings.synthesis.voice, response_format: 'wav' })}' --output speech.wav`
    return `curl ${base}/v1/chat/completions \\\n  -H "Authorization: Bearer YOUR_API_KEY" -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ model: 'nola-mt', messages: [{ role: 'user', content: 'Hello' }], translation_options: { source_lang: 'auto', target_lang: config.targetLanguage } })}'`
  }
  const realtimeExample = `import WebSocket from 'ws';
import { readFileSync } from 'node:fs';

const socket = new WebSocket('${address.replace(/^http/, 'ws').replace(/\/v1\/?$/, '').replace(/\/$/, '')}/v1/realtime?model=nola-asr', {
  headers: { Authorization: 'Bearer YOUR_API_KEY' },
});
socket.on('message', data => console.log(JSON.parse(data.toString())));
socket.on('open', async () => {
  socket.send(JSON.stringify({ type: 'session.update', session: {
    input_audio_format: 'pcm', sample_rate: 16000,
    turn_detection: { type: 'server_vad', silence_duration_ms: 800 },
  } }));
  const audio = readFileSync('audio.pcm');
  for (let offset = 0; offset < audio.length; offset += 6400) {
    socket.send(JSON.stringify({ type: 'input_audio_buffer.append',
      audio: audio.subarray(offset, offset + 6400).toString('base64'),
    }));
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
  socket.send(JSON.stringify({ type: 'session.finish' }));
});`
  return <div className="model-gateway-page">
    <PageHeader className="nola-page-heading" title={t('gateway.title')} actions={<Button variant={running ? 'danger' : 'default'} disabled={changing || (!running && config.externalEnabled === false && !CAPABILITIES.some(kind => config[kind]))} onClick={() => void perform(async () => {
      const result = running ? await api.stop() : await requestFeatureStart(() => api.start(), 'model-gateway')
      if (result) setSnapshot(result)
    }, 'runtime')}>{t(running ? 'gateway.stop' : 'gateway.start')}</Button>} />
    <Card data-onboarding="gateway-capabilities"><CardHeader><CardTitle className="flex items-center gap-2">{t('gateway.capabilities')}<Tooltip><TooltipTrigger delay={300} render={<Button variant="tertiary" size="icon-xs" className="border-transparent bg-transparent text-muted hover:bg-surface-secondary" aria-label={t('common.info')}><CircleHelp aria-hidden="true" className="size-3.5" /></Button>} /><TooltipContent className="z-popup max-w-96 whitespace-normal">{t('gateway.gatewayBindingHint')}</TooltipContent></Tooltip></CardTitle></CardHeader><CardContent><FieldGroup>
      {(['asr', 'mt', 'fallback', 'llm', 'tts'] as const).map(row => {
        const kind = row === 'fallback' ? 'mt' : row
        const fallback = row === 'fallback'
        const binding = fallback ? fallbackBinding() : config[kind] ? gatewayBinding(kind) : ''
        const options = choices.filter(choice => choice.kind === kind)
        const selected = options.find(choice => choice.id === binding)
        const label = t(fallback ? 'gateway.fallbackModel' : `gateway.${kind}`)
        const hint = t(fallback ? 'gateway.fallbackHint' : `gateway.${kind}Hint`)
        const empty = fallback ? 'none' : '__disabled__'
        return <Field key={row} className="model-gateway-capability-row">
          <div className="model-gateway-capability-title">
            <Tooltip><TooltipTrigger render={<FieldLabel htmlFor={`gateway-model-${row}`} />}>{label}</TooltipTrigger><TooltipContent className="z-popup max-w-96 whitespace-normal">{hint}</TooltipContent></Tooltip>
            {!fallback && config[kind] ? <Badge variant={snapshot.services[kind].state === 'ready' ? 'success' : snapshot.services[kind].state === 'failed' ? 'danger' : 'secondary'}>{t(`gateway.${snapshot.services[kind].state}`)}</Badge> : null}
          </div>
          <Select value={binding || empty} disabled={changing} onValueChange={value => { if (value) void perform(() => fallback ? selectFallback(value) : selectModel(kind, value), 'settings') }}>
            <SelectTrigger id={`gateway-model-${row}`} aria-label={fallback ? label : t('gateway.selectModel', { name: label })}><SelectValue>{binding ? selected?.name ?? t('gateway.modelNoneShort') : t(fallback ? 'gateway.fallbackNone' : 'gateway.proxyDisabled')}</SelectValue></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value={empty}>{t(fallback ? 'gateway.fallbackNone' : 'gateway.proxyDisabled')}</SelectItem>
              {options.map(choice => <SelectItem key={choice.id} value={choice.id}>{choice.name}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
          {!fallback ? <>
            {kind === 'llm' ? <FieldDescription>{t('gateway.protocol')}: {profiles.find(profile => `custom:${profile.id}` === binding)?.apiFormat ?? (bindingIsLocal(binding) ? 'llama.cpp' : t('gateway.configureModel'))}</FieldDescription> : null}
            <dl className="model-gateway-model-mapping">
              <div><dt>{t('gateway.modelId')}</dt><dd className="model-gateway-model-id"><code>{`nola-${kind}`}</code><Tooltip><TooltipTrigger delay={300} render={<Button variant="tertiary" size="icon-xs" className="border-transparent bg-transparent text-muted hover:bg-surface-secondary" aria-label={t('gateway.copyModelId', { model: `nola-${kind}` })} onClick={() => void copy(`nola-${kind}`)}><Copy aria-hidden="true" className="size-3.5" /></Button>} /><TooltipContent sideOffset={3} className="z-popup max-w-96 whitespace-normal break-all rounded-nola-ui-xl bg-overlay p-2 text-xs text-overlay-foreground shadow-overlay">{t('gateway.copyModelId', { model: `nola-${kind}` })}</TooltipContent></Tooltip></dd></div>
              <div><dt>{t('gateway.localModel')}</dt><dd className="model-gateway-local-model">{binding ? selected?.name ?? t('gateway.modelNoneShort') : t('gateway.proxyDisabled')}</dd></div>
            </dl>
            {config[kind] && snapshot.services[kind].state === 'failed' ? <Alert variant="danger"><AlertDescription>{t('gateway.serviceFailed')}</AlertDescription></Alert> : null}
          </> : null}
        </Field>
      })}
      <Button variant="secondary" onClick={() => navigate('#/models')}>{t('gateway.models')}</Button>
      <Field><div className="model-gateway-capability"><FieldLabel htmlFor="gateway-external">{t('gateway.externalApi')}</FieldLabel><Switch id="gateway-external" checked={config.externalEnabled !== false} disabled={changing} onCheckedChange={externalEnabled => void perform(() => updateSettings({ modelGateway: { externalEnabled } }), 'settings')}><SwitchThumb /></Switch></div><FieldDescription>{t('gateway.externalHint')}</FieldDescription></Field>
      <Field><FieldLabel htmlFor="gateway-host">{t('gateway.network')}</FieldLabel><Select value={config.host} onValueChange={host => { if (host === '127.0.0.1' || host === '0.0.0.0') void perform(() => updateSettings({ modelGateway: { host } }), 'settings') }}><SelectTrigger id="gateway-host"><SelectValue>{t(config.host === '127.0.0.1' ? 'gateway.loopback' : 'gateway.lan')}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="127.0.0.1">{t('gateway.loopback')}</SelectItem><SelectItem value="0.0.0.0">{t('gateway.lan')}</SelectItem></SelectGroup></SelectContent></Select>{config.host === '0.0.0.0' ? <FieldDescription>{t('gateway.lanHint')}</FieldDescription> : null}</Field>
      <Field><FieldLabel htmlFor="gateway-port">{t('gateway.port')}</FieldLabel><Input key={config.port} id="gateway-port" type="number" min={1024} max={65535} defaultValue={config.port} onBlur={event => { const port = Number(event.currentTarget.value); if (Number.isInteger(port) && port >= 1024 && port <= 65535 && port !== config.port) void perform(() => updateSettings({ modelGateway: { port } }), 'settings'); else event.currentTarget.value = String(config.port) }} /></Field>
      <Field><FieldLabel htmlFor="gateway-target">{t('gateway.targetLanguage')}</FieldLabel><Select value={config.targetLanguage} onValueChange={targetLanguage => { if (targetLanguage) void perform(() => updateSettings({ modelGateway: { targetLanguage } }), 'settings') }}><SelectTrigger id="gateway-target"><SelectValue>{languageName(config.targetLanguage, language)}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{targetLanguages.map(code => <SelectItem key={code} value={code}>{languageName(code, language)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <FieldDescription>{t('gateway.configHint')}</FieldDescription>
    </FieldGroup></CardContent></Card>
    <Card data-onboarding="gateway-service"><CardHeader><CardTitle>{t('gateway.service')}</CardTitle><CardDescription><Badge variant={snapshot.state === 'running' ? 'success' : snapshot.state === 'failed' ? 'danger' : 'secondary'}>{t(`gateway.${snapshot.state}`)}</Badge></CardDescription></CardHeader>
      <CardContent><FieldGroup>
        <Field><FieldLabel htmlFor="gateway-address">{t('gateway.address')}</FieldLabel><div className="model-gateway-control"><Input id="gateway-address" readOnly value={address} /><Button variant="secondary" aria-label={t('gateway.copy')} onClick={() => void copy(address)}><Copy aria-hidden="true" data-icon="inline-start" />{t('gateway.copy')}</Button></div></Field>
        <Field><FieldLabel htmlFor="gateway-key">{t('gateway.key')}</FieldLabel><div className="model-gateway-control"><Input id="gateway-key" readOnly type={key === null ? 'password' : 'text'} value={key ?? '••••••••••••••••'} />
          <Button variant="secondary" disabled={busy} aria-label={t(key === null ? 'gateway.reveal' : 'gateway.hide')} onClick={() => { if (key !== null) setKey(null); else void perform(async () => setKey(await api.revealKey())) }}>{key === null ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}</Button>
          <Button variant="secondary" aria-label={t('gateway.copy')} onClick={() => void perform(async () => { await navigator.clipboard.writeText(await api.revealKey()); notifySuccess(t('gateway.copied')) })}><Copy aria-hidden="true" /></Button>
          <Button variant="secondary" aria-label={t('gateway.rotate')} onClick={() => setRotating(true)}><RotateCcw aria-hidden="true" /></Button></div></Field>
        <div className="model-gateway-metrics"><p>{t('gateway.connections')}: <strong>{snapshot.connections}</strong></p><p>{t('gateway.activeRequests')}: <strong>{snapshot.activeRequests}</strong></p></div>
      </FieldGroup></CardContent></Card>
    <Card>
      <CardHeader>
        <CardTitle id="gateway-requests-title">{t('gateway.requests')}</CardTitle>
        <CardAction><Badge variant="secondary">{snapshot.requests.length}</Badge></CardAction>
      </CardHeader>
      <CardContent>
        {snapshot.requests.length ? <div className="model-gateway-requests-scroll" role="region" aria-labelledby="gateway-requests-title" tabIndex={0}>
          <ul className="model-gateway-requests">
            {snapshot.requests.map(request => {
              const Icon = REQUEST_ICONS[request.kind]
              return <li key={request.id}>
                <span className="model-gateway-request-icon"><Icon aria-hidden="true" /></span>
                <div className="model-gateway-request-info">
                  <div className="model-gateway-request-heading">
                    <span>{t(`gateway.${request.kind}`)}</span>
                    <time dateTime={new Date(request.startedAt).toISOString()}>{new Date(request.startedAt).toLocaleTimeString(language)}</time>
                  </div>
                  <span className="model-gateway-request-model truncate" title={request.model}>{request.model}</span>
                </div>
                <div className="model-gateway-request-result">
                  <Badge variant={request.status === 'failed' ? 'danger' : request.status === 'completed' ? 'success' : request.status === 'running' ? 'accent' : 'secondary'}>{t(`gateway.${request.status}`)}</Badge>
                  {request.durationMs !== undefined ? <span className="model-gateway-request-duration">{t('gateway.duration', { value: request.durationMs })}</span> : null}
                </div>
              </li>
            })}
          </ul>
        </div> : <Empty><EmptyHeader><EmptyMedia variant="icon"><Activity aria-hidden="true" /></EmptyMedia><EmptyTitle>{t('gateway.noRequests')}</EmptyTitle></EmptyHeader></Empty>}
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle>{t('gateway.examples')}</CardTitle><CardDescription>{t('gateway.examplesHint')}</CardDescription></CardHeader><CardContent><Tabs defaultValue="mt"><TabsList aria-label={t('gateway.examples')}>{CAPABILITIES.map(kind => <TabsTrigger key={kind} value={kind}>{t(`gateway.${kind}`)}</TabsTrigger>)}<TabsTrigger value="realtime">{t('gateway.realtime')}</TabsTrigger></TabsList>{CAPABILITIES.map(kind => <TabsContent key={kind} value={kind}><pre className="model-gateway-example"><code>{example(kind)}</code></pre><Button variant="secondary" onClick={() => void copy(example(kind))}>{t('gateway.copy')}</Button></TabsContent>)}<TabsContent value="realtime"><FieldDescription>{t('gateway.realtimeHint')}</FieldDescription><FieldDescription>{t('gateway.realtimeBrowserHint')}</FieldDescription><pre className="model-gateway-example"><code>{realtimeExample}</code></pre><Button variant="secondary" onClick={() => void copy(realtimeExample)}>{t('gateway.copy')}</Button></TabsContent></Tabs></CardContent></Card>
    <Dialog open={rotating} onOpenChange={setRotating}><DialogContent><DialogHeader><DialogTitle>{t('gateway.rotateTitle')}</DialogTitle><DialogDescription>{t('gateway.rotateDescription')}</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setRotating(false)}>{t('common.cancel')}</Button><Button disabled={busy} onClick={() => void perform(async () => { const nextKey = await api.rotateKey(); if (key !== null) setKey(nextKey); setRotating(false) })}>{t('gateway.rotate')}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
