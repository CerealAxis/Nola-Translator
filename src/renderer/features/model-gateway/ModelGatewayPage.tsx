import { useEffect, useState } from 'react'
import { Activity, Copy, Eye, EyeOff, Mic, Languages, RotateCcw, Volume2 } from 'lucide-react'
import { useI18n } from '@/i18n'
import { getBridge, stores, updateSettings, useStore } from '@/store'
import { useRoute } from '@/routes'
import { requestFeatureStart } from '@/components/primitives/FeatureActivityNotice'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
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
import { languageName } from '../../../shared/languages'
import { translationLanguages } from '../../../shared/model-capabilities'
import './model-gateway.css'

const CAPABILITIES: GatewayCapability[] = ['asr', 'mt', 'tts']
const REQUEST_ICONS = { asr: Mic, mt: Languages, tts: Volume2 }

export function ModelGatewayPage() {
  const { t, language } = useI18n()
  const { navigate } = useRoute()
  const settings = useStore(stores.settings, state => state.settings)
  const resources = useStore(stores.models, state => state.resources)
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
  if (!settings || !snapshot) return <div className="model-gateway-page"><h1>{t('gateway.title')}</h1><p>{t(loadFailed ? 'gateway.actionFailed' : 'common.loading')}</p>{loadFailed ? <Button onClick={() => void refresh()}>{t('gateway.refresh')}</Button> : null}</div>
  const config = settings.modelGateway
  const translationModel = resources.find(record => record.resourceId === settings.translation.localModelId)
  const targetLanguages = [...new Set([config.targetLanguage, ...translationLanguages(translationModel, 'auto').filter(code => code !== 'none')])]
  const running = snapshot.state === 'running' || snapshot.state === 'starting'
  const changing = busy || snapshot.state === 'starting' || snapshot.state === 'stopping'
  const perform = async (action: () => Promise<unknown>, operation: 'action' | 'runtime' | 'settings' = 'action') => {
    setBusy(true)
    try { await action() } catch (error) {
      console.error('[gateway.action]', error)
      const current = operation === 'runtime' ? await api.snapshot().catch(() => null) : null
      if (operation !== 'settings' && (!current || (current.state !== 'failed' && !Object.values(current.services).some(service => service.state === 'failed')))) notifyError(t('gateway.actionFailed'))
    }
    finally { setBusy(false) }
  }
  const copy = (value: string) => perform(async () => { await navigator.clipboard.writeText(value); notifySuccess(t('gateway.copied')) })
  const address = snapshot.state === 'stopped' ? `http://127.0.0.1:${config.port}/v1` : snapshot.address.replace('://0.0.0.0', '://127.0.0.1') || `http://127.0.0.1:${config.port}/v1`
  const serviceName = (kind: GatewayCapability) => {
    if (snapshot.state !== 'stopped') return snapshot.services[kind].name || t('gateway.configureModel')
    const id = kind === 'asr' ? settings.recognition.modelId : kind === 'mt' ? settings.translation.localModelId : settings.synthesis.modelId
    const record = resources.find(resource => resource.resourceId === id && resource.installed)
    return record?.name ?? t('gateway.configureModel')
  }
  const example = (kind: GatewayCapability) => {
    const base = address.replace(/\/v1\/?$/, '').replace(/\/$/, '')
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
    <header className="model-gateway-heading"><div><h1>{t('gateway.title')}</h1><p>{t('gateway.subtitle')}</p></div><Button disabled={changing || (!running && !CAPABILITIES.some(kind => config[kind]))} onClick={() => void perform(async () => {
      const result = running ? await api.stop() : await requestFeatureStart(() => api.start(), 'model-gateway')
      if (result) setSnapshot(result)
    }, 'runtime')}>{t(running ? 'gateway.stop' : 'gateway.start')}</Button></header>
    <Card data-onboarding="gateway-service"><CardHeader><CardTitle>{t('gateway.service')}</CardTitle><CardDescription><Badge variant={snapshot.state === 'running' ? 'success' : snapshot.state === 'failed' ? 'danger' : 'secondary'}>{t(`gateway.${snapshot.state}`)}</Badge></CardDescription></CardHeader>
      <CardContent><FieldGroup>
        <Field><FieldLabel htmlFor="gateway-address">{t('gateway.address')}</FieldLabel><div className="model-gateway-control"><Input id="gateway-address" readOnly value={address} /><Button variant="secondary" aria-label={t('gateway.copy')} onClick={() => void copy(address)}><Copy aria-hidden="true" data-icon="inline-start" />{t('gateway.copy')}</Button></div></Field>
        <Field><FieldLabel htmlFor="gateway-key">{t('gateway.key')}</FieldLabel><div className="model-gateway-control"><Input id="gateway-key" readOnly type={key === null ? 'password' : 'text'} value={key ?? '••••••••••••••••'} />
          <Button variant="secondary" disabled={busy} aria-label={t(key === null ? 'gateway.reveal' : 'gateway.hide')} onClick={() => { if (key !== null) setKey(null); else void perform(async () => setKey(await api.revealKey())) }}>{key === null ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}</Button>
          <Button variant="secondary" aria-label={t('gateway.copy')} onClick={() => void perform(async () => { await navigator.clipboard.writeText(await api.revealKey()); notifySuccess(t('gateway.copied')) })}><Copy aria-hidden="true" /></Button>
          <Button variant="secondary" aria-label={t('gateway.rotate')} onClick={() => setRotating(true)}><RotateCcw aria-hidden="true" /></Button></div></Field>
        <div className="model-gateway-metrics"><p>{t('gateway.connections')}: <strong>{snapshot.connections}</strong></p><p>{t('gateway.activeRequests')}: <strong>{snapshot.activeRequests}</strong></p></div>
      </FieldGroup></CardContent></Card>
    <Card data-onboarding="gateway-capabilities"><CardHeader><CardTitle>{t('gateway.capabilities')}</CardTitle><CardDescription>{t('gateway.modelIdHint')}</CardDescription><CardDescription>{t('gateway.defaultsHint')}</CardDescription></CardHeader><CardContent><FieldGroup>
      {CAPABILITIES.map(kind => <Field key={kind} className="model-gateway-capability-row"><div className="model-gateway-capability"><div className="model-gateway-capability-title"><FieldLabel htmlFor={`gateway-${kind}`}>{t(`gateway.${kind}`)}</FieldLabel>{config[kind] ? <Badge variant={snapshot.services[kind].state === 'ready' ? 'success' : snapshot.services[kind].state === 'failed' ? 'danger' : 'secondary'}>{t(`gateway.${snapshot.services[kind].state}`)}</Badge> : null}</div><Switch id={`gateway-${kind}`} disabled={busy} checked={config[kind]} onCheckedChange={checked => { void perform(() => updateSettings({ modelGateway: { [kind]: checked } }), 'settings') }}><SwitchThumb /></Switch></div>
        <dl className="model-gateway-model-mapping">
          <div><dt>{t('gateway.modelId')}</dt><dd className="model-gateway-model-id"><code>{`nola-${kind}`}</code><Button variant="tertiary" size="icon-sm" aria-label={t('gateway.copyModelId', { model: `nola-${kind}` })} title={t('gateway.copyModelId', { model: `nola-${kind}` })} onClick={() => void copy(`nola-${kind}`)}><Copy aria-hidden="true" /></Button></dd></div>
          <div><dt>{t('gateway.localModel')}</dt><dd className="model-gateway-local-model">{serviceName(kind)}</dd></div>
        </dl>
        {config[kind] && snapshot.services[kind].state === 'failed' ? <Alert variant="danger"><AlertDescription>{t('gateway.serviceFailed')}</AlertDescription></Alert> : null}
      </Field>)}
      <Button variant="secondary" onClick={() => navigate('#/models')}>{t('gateway.models')}</Button>
      <Field><FieldLabel htmlFor="gateway-host">{t('gateway.network')}</FieldLabel><Select value={config.host} onValueChange={host => { if (host === '127.0.0.1' || host === '0.0.0.0') void perform(() => updateSettings({ modelGateway: { host } }), 'settings') }}><SelectTrigger id="gateway-host"><SelectValue>{t(config.host === '127.0.0.1' ? 'gateway.loopback' : 'gateway.lan')}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="127.0.0.1">{t('gateway.loopback')}</SelectItem><SelectItem value="0.0.0.0">{t('gateway.lan')}</SelectItem></SelectGroup></SelectContent></Select>{config.host === '0.0.0.0' ? <FieldDescription>{t('gateway.lanHint')}</FieldDescription> : null}</Field>
      <Field><FieldLabel htmlFor="gateway-port">{t('gateway.port')}</FieldLabel><Input key={config.port} id="gateway-port" type="number" min={1024} max={65535} defaultValue={config.port} onBlur={event => { const port = Number(event.currentTarget.value); if (Number.isInteger(port) && port >= 1024 && port <= 65535 && port !== config.port) void perform(() => updateSettings({ modelGateway: { port } }), 'settings'); else event.currentTarget.value = String(config.port) }} /></Field>
      <Field><FieldLabel htmlFor="gateway-target">{t('gateway.targetLanguage')}</FieldLabel><Select value={config.targetLanguage} onValueChange={targetLanguage => { if (targetLanguage) void perform(() => updateSettings({ modelGateway: { targetLanguage } }), 'settings') }}><SelectTrigger id="gateway-target"><SelectValue>{languageName(config.targetLanguage, language)}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{targetLanguages.map(code => <SelectItem key={code} value={code}>{languageName(code, language)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <FieldDescription>{t('gateway.configHint')}</FieldDescription>
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
