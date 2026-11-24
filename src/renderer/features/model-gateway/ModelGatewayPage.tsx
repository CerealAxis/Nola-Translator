import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Activity, CircleHelp, Copy, Eye, EyeOff, Mic, Languages, RotateCcw, Volume2, Bot, ScanText } from 'lucide-react'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { useI18n } from '@/i18n'
import { getBridge, stores, updateSettings, useStore } from '@/store'
import { requestFeatureStart } from '@/components/primitives/FeatureActivityNotice'
import { PageHeader } from '@/components/primitives'
import { notifyError, notifySuccess, notifyWarning } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CodeBlock, CodeBlockActions, CodeBlockHeader, CodeBlockTitle } from '@/components/ui/code-block'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { GatewayCapability, ModelGatewaySnapshot } from '../../../shared/model-gateway'
import { gatewayConcurrency, bindingIsLocal, normalizeModelBinding } from '../../../shared/model-gateway'
import { defaultModelBinding, modelEnablePatch } from '../../../shared/model-policy'
import { defaultRealtimeS2s, MIMO_TTS_BINDING, MIMO_TTS_NAME, REALTIME_S2S_MODELS } from '../../../shared/settings'
import { SettingSelect } from '../settings/SettingsPage'
import { RealtimePipelineLabel, realtimeS2sNames } from '../workspace/RealtimePipelineSelect'
import { ModelAvailabilityLabel } from '../workspace/ModelAvailabilityLabel'
import { languageName } from '../../../shared/languages'
import { useModelOptions } from '@/model-options'
import { performanceMonitorTitles } from '../../../shared/window-titles'
import { customModelsOf } from '../../../shared/custom-models'
import { cloudModelsOf } from '../../../shared/cloud-models'
import { gatewayBindingPatch } from '@/available-models'
import { installedPlaygroundModels } from '../workbench/installed-models'
import { isModelReady } from '../../../shared/model-capabilities'
import { supportsSelectedEngine, modelEngines } from '../../../shared/model-engines'
import { isEngineAvailable } from '../models/engine-availability'

const CAPABILITIES: GatewayCapability[] = ['asr', 'mt', 'tts', 'llm', 'ocr']
const PUBLIC_CAPABILITIES = ['asr', 'mt', 'tts'] as const
const REQUEST_ICONS = { asr: Mic, mt: Languages, tts: Volume2, llm: Bot, ocr: ScanText }

const exampleHighlighter = createHighlighterCore({
  themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
  langs: [import('shiki/langs/shellscript.mjs'), import('shiki/langs/javascript.mjs')],
  engine: createJavaScriptRegexEngine({ forgiving: true }),
})

function GatewayExample({ code, language, copyLabel, onCopy }: {
  code: string; language: 'shellscript' | 'javascript'; copyLabel: string; onCopy: () => void
}) {
  const [highlighted, setHighlighted] = useState<{ code: string; language: string; content: ReactNode } | null>(null)
  useEffect(() => {
    let active = true
    void exampleHighlighter.then(highlighter => {
      const { tokens } = highlighter.codeToTokens(code, { lang: language, themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false })
      if (active) setHighlighted({ code, language, content: tokens.map((line, lineIndex) => <span key={lineIndex}>{line.map((token, tokenIndex) =>
        <span key={tokenIndex} style={token.htmlStyle as CSSProperties} className="text-(--shiki-light) dark:text-(--shiki-dark)">{token.content}</span>,
      )}{lineIndex < tokens.length - 1 ? '\n' : null}</span>) })
    }).catch(() => {})
    return () => { active = false }
  }, [code, language])
  return <CodeBlock>
    <CodeBlockHeader>
      <CodeBlockTitle>{language === 'shellscript' ? 'curl' : 'JavaScript'}</CodeBlockTitle>
      <CodeBlockActions><Tooltip><TooltipTrigger render={<Button variant="bare" size="icon-xs" aria-label={copyLabel} onClick={onCopy}><Copy aria-hidden="true" /></Button>} /><TooltipContent>{copyLabel}</TooltipContent></Tooltip></CodeBlockActions>
    </CodeBlockHeader>
    <pre data-slot="code-block-content" tabIndex={0} dir="ltr" className="type-code overflow-x-auto p-4"><code>{highlighted?.code === code && highlighted.language === language ? highlighted.content : code}</code></pre>
  </CodeBlock>
}

export function ModelGatewayPage() {
  const { t, language } = useI18n()
  const settings = useStore(stores.settings, state => state.settings)
  const modelOptions = useModelOptions(undefined, settings ? settings.modelGateway.mtModel || defaultModelBinding(settings, 'mt') : undefined)
  const runtimes = useStore(stores.settings, state => state.runtimes)
  const resources = useStore(stores.models, state => state.resources)
  const credentials = useStore(stores.models, state => state.credentials)
  const configuredCloudModels = settings ? cloudModelsOf(settings, credentials).filter(model => model.ready) : []
  const api = getBridge()?.gateway
  const [snapshot, setSnapshot] = useState<ModelGatewaySnapshot | null>(null)
  const [pendingSettings, setPendingSettings] = useState(0)
  const [runtimeBusy, setRuntimeBusy] = useState(false)
  const [keyBusy, setKeyBusy] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)
  const [confirmS2sOff, setConfirmS2sOff] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const refresh = async () => {
    if (!api) return
    try { setSnapshot(await api.snapshot()); setLoadFailed(false) }
    catch (error) { console.error('[gateway.snapshot]', error); setLoadFailed(true) }
  }
  useEffect(() => {
    if (!api) return
    let alive = true
    let receivedChange = false
    const unsubscribe = api.onChanged(value => {
      receivedChange = true
      if (alive) setSnapshot(value)
    })
    void api.snapshot().then(value => {
      if (alive && !receivedChange) setSnapshot(value)
    }).catch(error => { console.error('[gateway.snapshot]', error); if (alive) setLoadFailed(true) })
    return () => { alive = false; unsubscribe() }
  }, [api])
  const performanceMonitorButton = api?.openPerformanceMonitor && <Button variant="outline" onClick={() => {
    const state = snapshot?.state
    if (runtimeBusy || state === 'starting' || state === 'stopping') {
      notifyWarning(t('gateway.startupWaitHint'))
      return
    }
    if (!state) {
      notifyWarning(t('gateway.startupStatusUnavailable'))
      return
    }
    if (state !== 'running') {
      notifyWarning(t('gateway.performanceStartHint'))
      return
    }
    void api.openPerformanceMonitor?.().catch(error => notifyError(t('gateway.actionFailed'), { cause: error }))
  }}>
    {performanceMonitorTitles[language]}
  </Button>
  if (!api) return <Alert><AlertDescription>{t('gateway.unavailable')}</AlertDescription></Alert>
  if (!settings || !snapshot) return <div className="model-gateway-page"><PageHeader className="nola-page-heading" title={t('gateway.title')} actions={performanceMonitorButton} /><p>{t(loadFailed ? 'gateway.actionFailed' : 'common.loading')}</p>{loadFailed ? <Button onClick={() => void refresh()}>{t('gateway.refresh')}</Button> : null}</div>
  const config = settings.modelGateway
  const defaultS2sModel = defaultRealtimeS2s(settings)
  const translationMode = defaultS2sModel ? 's2s' : 'cascade'
  const configuredS2sModel = settings.realtime?.s2sModel ?? defaultS2sModel
  const s2sReady = configuredCloudModels.some(model => model.id === 'aliyun')
  const s2sBlocked = translationMode === 's2s' && !s2sReady
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
  if (credentials['mimo-tts']) cloudChoices.push({ id: MIMO_TTS_BINDING, name: MIMO_TTS_NAME, kind: 'tts' })
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
      ...(kind === 'ocr' ? resources.filter(resource => resource.kind === 'ocrModel' && resource.installed).map(resource => ({ id: `resource:${resource.resourceId}`, name: resource.name, kind: 'ocr' as const })) : []),
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
  const gatewayBinding = (kind: GatewayCapability) => normalizeModelBinding(kind, kind === 'ocr' ? config.ocrModel : kind === 'llm' ? config.llmModel
    : kind === 'asr' ? config.asrModel : kind === 'tts' ? config.ttsModel : config.mtModel)
    || defaultModelBinding(settings, kind)
  const fallbackBinding = () => normalizeModelBinding('mt', config.mtFallbackModel)
  const concurrencyResource = (kind: GatewayCapability) => resources.find(item => `resource:${item.resourceId}` === gatewayBinding(kind))
  const concurrencyFor = (kind: GatewayCapability) => gatewayConcurrency(gatewayBinding(kind), config.concurrency?.[kind], concurrencyResource(kind))
  const targetLanguages = [...new Set(modelOptions.translationTargetLanguages)]
  const running = snapshot.state === 'running' || snapshot.state === 'starting'
  const changing = runtimeBusy || snapshot.state === 'starting' || snapshot.state === 'stopping'
  const perform = async (action: () => Promise<unknown>, operation: 'action' | 'runtime' | 'settings' | 'key' = 'action') => {
    if (operation === 'settings') setPendingSettings(count => count + 1)
    if (operation === 'runtime') setRuntimeBusy(true)
    if (operation === 'key') setKeyBusy(true)
    try { await action() } catch (error) {
      console.error('[gateway.action]', error)
      if (error instanceof Error && error.message.includes('S2S_CONFIGURATION_MISSING')) {
        notifyError(t('session.s2sSetupHint'))
        return
      }
      const current = operation === 'runtime' ? await api.snapshot().catch(() => null) : null
      if (operation === 'settings' || !current || (current.state !== 'failed' && !Object.values(current.services).some(service => service?.state === 'failed'))) notifyError(t('gateway.actionFailed'), { cause: error })
    }
    finally {
      if (operation === 'settings') setPendingSettings(count => count - 1)
      if (operation === 'runtime') setRuntimeBusy(false)
      if (operation === 'key') setKeyBusy(false)
    }
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
  const modelLabel = (row: GatewayCapability | 'fallback' | 's2s') => t(row === 's2s' ? 'models.s2sModels' : row === 'fallback' ? 'gateway.fallbackModel' : `gateway.${row}`)
  const concurrencyField = (row: GatewayCapability) => {
    const provider = concurrencyResource(row)?.provider
    const crisp = provider === 'crisp-asr' || provider === 'crisp-tts'
    const field = <Field data-disabled={changing || crisp || undefined}>
      <FieldLabel className="sr-only" htmlFor={`gateway-concurrency-${row}`}>{t('gateway.concurrencyFor', { name: modelLabel(row) })}</FieldLabel>
      <Input key={`${gatewayBinding(row)}:${concurrencyFor(row)}`} id={`gateway-concurrency-${row}`} type="number" min={1} step={1} disabled={changing || crisp}
        defaultValue={concurrencyFor(row)} onBlur={event => {
          const input = event.currentTarget
          const value = Number(input.value)
          const current = concurrencyFor(row)
          if (Number.isSafeInteger(value) && value >= 1 && value !== current) {
            void perform(() => updateSettings({ modelGateway: { concurrency: { [row]: value } } }), 'settings').then(() => { if (input.value === String(value)) input.value = String(gatewayConcurrency(gatewayBinding(row), stores.settings.getState().settings?.modelGateway.concurrency?.[row], concurrencyResource(row))) })
          } else input.value = String(current)
        }} />
    </Field>
    return field
  }
  const modelPicker = (row: GatewayCapability | 'fallback') => {
    const fallback = row === 'fallback'
    const kind = fallback ? 'mt' : row
    const binding = fallback ? fallbackBinding() : config[kind] ? gatewayBinding(kind) : ''
    const options = choices.filter(choice => choice.kind === kind)
    const empty = fallback ? 'none' : '__disabled__'
    const emptyLabel = t(fallback ? 'gateway.fallbackNone' : 'gateway.proxyDisabled')
    return <Select value={binding || empty} disabled={changing} onValueChange={value => {
      if (value) void perform(() => fallback ? selectFallback(value) : selectModel(kind, value), 'settings')
    }}>
      <SelectTrigger id={`gateway-model-${row}`} aria-label={fallback ? modelLabel(row) : t('gateway.selectModel', { name: modelLabel(row) })}>
        <SelectValue>{binding ? options.find(choice => choice.id === binding)?.name ?? t('gateway.modelNoneShort') : emptyLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent><SelectGroup>
        <SelectItem value={empty}>{emptyLabel}</SelectItem>
        {options.map(choice => <SelectItem key={choice.id} value={choice.id}>{choice.name}</SelectItem>)}
      </SelectGroup></SelectContent>
    </Select>
  }
  const modelStatus = (kind: GatewayCapability | 'fallback') => {
    if (kind === 'fallback') return <span className="text-muted">—</span>
    if (!config[kind]) return <Badge variant="outline" className="text-muted">{t('gateway.proxyDisabled')}</Badge>
    const { state } = snapshot.services[kind] ?? { state: 'stopped' }
    const binding = gatewayBinding(kind)
    return <div className="flex flex-col items-start gap-1">
      <Badge variant={state === 'ready' ? 'success' : state === 'failed' ? 'danger' : 'secondary'}>{t(state === 'stopped' ? 'gateway.modelStopped' : state === 'failed' ? 'gateway.modelLoadFailed' : `gateway.${state}`)}</Badge>
      {kind === 'llm' ? <FieldDescription>{profiles.find(profile => `custom:${profile.id}` === binding)?.apiFormat ?? (bindingIsLocal(binding) ? 'llama.cpp' : t('gateway.configureModel'))}</FieldDescription> : null}
      {state === 'failed' ? <FieldDescription role="alert">{t('gateway.serviceFailed')}</FieldDescription> : null}
    </div>
  }
  const modelId = (kind: typeof PUBLIC_CAPABILITIES[number]) => {
    const id = `nola-${kind}`
    return <span className="model-gateway-model-id"><code>{id}</code><Tooltip>
      <TooltipTrigger render={<Button variant="bare" size="icon-xs" aria-label={t('gateway.copyModelId', { model: id })} onClick={() => void copy(id)}><Copy aria-hidden="true" /></Button>} />
      <TooltipContent>{t('gateway.copyModelId', { model: id })}</TooltipContent>
    </Tooltip></span>
  }
  const address = snapshot.state === 'stopped' ? `http://127.0.0.1:${config.port}/v2` : snapshot.address.replace('://0.0.0.0', '://127.0.0.1') || `http://127.0.0.1:${config.port}/v2`
  const example = (kind: typeof PUBLIC_CAPABILITIES[number]) => {
    const base = address.replace(/\/v2\/?$/, '').replace(/\/$/, '')
    if (kind === 'asr') return `curl ${base}/v2/audio/transcriptions \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -F "model=nola-asr" -F "file=@audio.wav"`
    if (kind === 'tts') return `curl ${base}/v2/audio/speech \\\n  -H "Authorization: Bearer YOUR_API_KEY" -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ model: 'nola-tts', input: 'Hello', voice: settings.synthesis.voice, response_format: 'wav' })}' --output speech.wav`
    return `curl ${base}/v2/chat/completions \\\n  -H "Authorization: Bearer YOUR_API_KEY" -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ model: 'nola-mt', messages: [{ role: 'user', content: 'Hello' }], translation_options: { source_lang: 'auto', target_lang: config.targetLanguage } })}'`
  }
  const realtimeExample = `import WebSocket from 'ws';
import { readFileSync } from 'node:fs';

const socket = new WebSocket('${address.replace(/^http/, 'ws').replace(/\/v2\/?$/, '').replace(/\/$/, '')}/v2/realtime?model=nola-asr', {
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
    <PageHeader className="nola-page-heading" title={t('gateway.title')} actions={<div className="model-gateway-header-actions">{performanceMonitorButton}<Button data-onboarding="gateway-start" variant={running ? 'danger' : 'default'} disabled={pendingSettings > 0 || changing || (!running && (s2sBlocked || config.externalEnabled === false && !CAPABILITIES.some(kind => config[kind])))} onClick={() => void perform(async () => {
      const result = running ? await api.stop() : await requestFeatureStart(() => api.start(), 'model-gateway')
      if (result) setSnapshot(result)
    }, 'runtime')}>{t(running ? 'gateway.stop' : 'gateway.start')}</Button></div>} />
    <Card>
      <CardHeader><CardTitle><RealtimePipelineLabel /></CardTitle></CardHeader>
      <CardContent>
        <SettingSelect ariaLabel={t('session.pipeline')} isDisabled={changing} value={translationMode} options={[
          { value: 'cascade', label: t('session.cascade') }, { value: 's2s', label: t('session.directSpeech') },
        ]} onChange={value => {
          if (value === 's2s' && (!s2sReady || settings.realtime?.s2sModel === null)) {
            notifyWarning(t('session.s2sModelRequired'))
            return
          }
          if (value === 'cascade' || value === 's2s') {
            void perform(() => updateSettings({ realtime: { defaultPipeline: value } }), 'settings')
          }
        }} />
      </CardContent>
    </Card>
    <Card data-onboarding="gateway-capabilities"><CardHeader><CardTitle className="flex items-center gap-1">{t('gateway.capabilities')}<Tooltip><TooltipTrigger delay={300} render={<Button variant="tertiary" size="icon-xs" className="-ms-[5px] border-transparent bg-transparent text-muted hover:bg-surface-secondary" aria-label={t('common.info')}><CircleHelp aria-hidden="true" className="size-3.5" /></Button>} /><TooltipContent className="z-popup max-w-96 whitespace-normal">{t('gateway.gatewayBindingHint')}</TooltipContent></Tooltip></CardTitle></CardHeader><CardContent><FieldGroup>
      <Field>
        <ModelAvailabilityLabel label={t('gateway.loadMode')} hint={<div className="flex max-w-80 flex-col gap-2 whitespace-normal">
          <p><strong>{t('gateway.onDemand')}</strong><br />{t('gateway.onDemandHint')}</p>
          <p><strong>{t('gateway.directLoad')}</strong><br />{t('gateway.directLoadHint')}</p>
        </div>} />
        <SettingSelect ariaLabel={t('gateway.loadMode')} isDisabled={changing} value={config.loadMode ?? 'on-demand'} options={[
          { value: 'on-demand', label: t('gateway.onDemand') }, { value: 'direct', label: t('gateway.directLoad') },
        ]} onChange={loadMode => {
          if (loadMode === 'on-demand' || loadMode === 'direct') void perform(() => updateSettings({ modelGateway: { loadMode } }), 'settings')
        }} />
      </Field>
      <div className="model-gateway-table-scroll">
        <table className="model-gateway-table" aria-label={t('gateway.capabilities')}>
          <thead><tr><th scope="col">{t('gateway.capabilityColumn')}</th><th scope="col">{t('gateway.modelColumn')}</th><th scope="col">{t('gateway.stateColumn')}</th><th scope="col"><ModelAvailabilityLabel label={t('gateway.concurrency')} hint={<span className="block max-w-80 whitespace-normal">{t('gateway.concurrencyHint')}</span>} /></th><th scope="col">{t('gateway.modelId')}</th></tr></thead>
          <tbody>{(['asr', 'mt', 'tts', 's2s', 'llm', 'ocr', 'fallback'] as const).map(row => <tr key={row} data-onboarding={`gateway-${row}`}>
            <th scope="row" className="font-normal"><Tooltip><TooltipTrigger type="button" className="cursor-help text-start">{modelLabel(row)}</TooltipTrigger><TooltipContent>{t(row === 's2s' ? 'models.s2sModelsHint' : row === 'fallback' ? 'gateway.fallbackHint' : `gateway.${row}Hint`)}</TooltipContent></Tooltip></th>
            <td>{row === 's2s'
              ? <SettingSelect ariaLabel={modelLabel(row)} isDisabled={changing || !s2sReady} value={s2sReady ? configuredS2sModel ?? 'off' : 'off'} options={[
                { value: 'off', label: t('gateway.proxyDisabled') },
                ...REALTIME_S2S_MODELS.map(value => ({ value, label: realtimeS2sNames[value] })),
              ]} onChange={value => {
                if (!s2sReady) return
                const model = REALTIME_S2S_MODELS.find(item => item === value)
                if (value === 'off') {
                  if (translationMode === 's2s') setConfirmS2sOff(true)
                  else void perform(() => updateSettings({ realtime: { s2sModel: null, defaultPipeline: 'cascade' } }), 'settings')
                } else if (model) void perform(() => updateSettings({ realtime: { s2sModel: model, defaultPipeline: translationMode } }), 'settings')
              }} />
              : modelPicker(row)}</td>
            <td>{row === 's2s'
              ? configuredS2sModel && s2sReady
                ? <FieldDescription>{t('session.s2sSessionHint')}</FieldDescription>
                : <Badge variant="outline" className="text-muted">{t('gateway.proxyDisabled')}</Badge>
              : modelStatus(row)}</td>
            <td>{row === 's2s' ? <span className="text-muted">—</span> : row === 'fallback' ? <span className="type-muted">{t('gateway.concurrencySharedMt')}</span> : concurrencyField(row)}</td>
            <td>{row === 'asr' || row === 'mt' || row === 'tts' ? modelId(row) : <span className="text-muted">—</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <Field>
        <div className="model-gateway-capability">
          <div className="flex items-center gap-1">
            <FieldLabel htmlFor="gateway-external">{t('gateway.externalApi')}</FieldLabel>
            <Tooltip>
              <TooltipTrigger delay={300} render={<Button variant="tertiary" size="icon-xs" className="-ms-[5px] border-transparent bg-transparent text-muted hover:bg-surface-secondary" aria-label={t('common.info')}><CircleHelp aria-hidden="true" className="size-3.5" /></Button>} />
              <TooltipContent className="z-popup max-w-96 whitespace-normal">{t('gateway.externalHint')}</TooltipContent>
            </Tooltip>
          </div>
          <Switch id="gateway-external" checked={config.externalEnabled !== false} disabled={changing} onCheckedChange={externalEnabled => void perform(() => updateSettings({ modelGateway: { externalEnabled } }), 'settings')}><SwitchThumb /></Switch>
        </div>
      </Field>
      <Field><FieldLabel htmlFor="gateway-host">{t('gateway.network')}</FieldLabel><Select value={config.host} onValueChange={host => { if (host === '127.0.0.1' || host === '0.0.0.0') void perform(() => updateSettings({ modelGateway: { host } }), 'settings') }}><SelectTrigger id="gateway-host"><SelectValue>{t(config.host === '127.0.0.1' ? 'gateway.loopback' : 'gateway.lan')}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="127.0.0.1">{t('gateway.loopback')}</SelectItem><SelectItem value="0.0.0.0">{t('gateway.lan')}</SelectItem></SelectGroup></SelectContent></Select>{config.host === '0.0.0.0' ? <FieldDescription>{t('gateway.lanHint')}</FieldDescription> : null}</Field>
      <Field><FieldLabel htmlFor="gateway-port">{t('gateway.port')}</FieldLabel><Input key={config.port} id="gateway-port" type="number" min={1024} max={65535} defaultValue={config.port} onBlur={event => { const input = event.currentTarget; const port = Number(input.value); if (Number.isInteger(port) && port >= 1024 && port <= 65535 && port !== config.port) void perform(() => updateSettings({ modelGateway: { port } }), 'settings').then(() => { if (input.value === String(port)) input.value = String(stores.settings.getState().settings?.modelGateway.port ?? config.port) }); else input.value = String(config.port) }} /></Field>
      <Field><FieldLabel htmlFor="gateway-target">{t('gateway.targetLanguage')}</FieldLabel><Select value={config.targetLanguage} onValueChange={targetLanguage => { if (targetLanguage) void perform(() => updateSettings({ modelGateway: { targetLanguage } }), 'settings') }}><SelectTrigger id="gateway-target"><SelectValue>{languageName(config.targetLanguage, language)}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{targetLanguages.map(code => <SelectItem key={code} value={code}>{languageName(code, language)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    </FieldGroup></CardContent></Card>
    <Card data-onboarding="gateway-service"><CardContent><FieldGroup>
        <Field>
          <FieldLabel htmlFor="gateway-address">{t('gateway.address')}</FieldLabel>
          <InputGroup>
            <InputGroupInput id="gateway-address" readOnly value={address} />
            <InputGroupAddon align="inline-end">
              <Button variant="bare" size="icon-sm" aria-label={t('gateway.copy')} onClick={() => void copy(address)}><Copy aria-hidden="true" /></Button>
            </InputGroupAddon>
          </InputGroup>
        </Field>
        <Field>
          <FieldLabel htmlFor="gateway-key">{t('gateway.key')}</FieldLabel>
          <InputGroup>
            <InputGroupInput id="gateway-key" readOnly type={key === null ? 'password' : 'text'} value={key ?? '••••••••••••••••'} />
            <InputGroupAddon align="inline-end">
              <Button variant="bare" size="icon-sm" disabled={keyBusy} aria-label={t(key !== null ? 'gateway.hide' : 'gateway.reveal')} onClick={() => { if (key !== null) setKey(null); else void perform(async () => setKey(await api.revealKey()), 'key') }}>{key === null ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}</Button>
              <Button variant="bare" size="icon-sm" disabled={keyBusy} aria-label={t('gateway.copy')} onClick={() => void perform(async () => { await navigator.clipboard.writeText(await api.revealKey()); notifySuccess(t('gateway.copied')) }, 'key')}><Copy aria-hidden="true" /></Button>
              <Button variant="bare" size="icon-sm" disabled={keyBusy} aria-label={t('gateway.rotate')} onClick={() => setRotating(true)}><RotateCcw aria-hidden="true" /></Button>
            </InputGroupAddon>
          </InputGroup>
        </Field>
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
                  <Tooltip><TooltipTrigger render={<span className="model-gateway-request-model truncate" />}>{request.model}</TooltipTrigger><TooltipContent>{request.model}</TooltipContent></Tooltip>
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
    <Card><CardHeader><CardTitle><ModelAvailabilityLabel label={t('gateway.examples')} hint={t('gateway.examplesHint')} /></CardTitle></CardHeader><CardContent><Tabs defaultValue="mt"><TabsList className="w-full" aria-label={t('gateway.examples')}>{PUBLIC_CAPABILITIES.map(kind => <TabsTrigger key={kind} value={kind}>{t(`gateway.${kind}`)}</TabsTrigger>)}<Tooltip><TooltipTrigger render={<TabsTrigger value="realtime" />}><span>{t('gateway.realtime')}</span><CircleHelp className="size-3.5" aria-hidden="true" /></TooltipTrigger><TooltipContent><div className="flex max-w-80 flex-col gap-2 whitespace-normal"><p>{t('gateway.realtimeHint')}</p><p>{t('gateway.realtimeBrowserHint')}</p></div></TooltipContent></Tooltip></TabsList>{PUBLIC_CAPABILITIES.map(kind => <TabsContent key={kind} value={kind} className="mt-[var(--panel-gap)]"><GatewayExample code={example(kind)} language="shellscript" copyLabel={t('gateway.copy')} onCopy={() => void copy(example(kind))} /></TabsContent>)}<TabsContent value="realtime" className="mt-[var(--panel-gap)]"><GatewayExample code={realtimeExample} language="javascript" copyLabel={t('gateway.copy')} onCopy={() => void copy(realtimeExample)} /></TabsContent></Tabs></CardContent></Card>
    <Dialog open={confirmS2sOff} onOpenChange={setConfirmS2sOff}><DialogContent>
      <DialogHeader><DialogTitle>{t('session.s2sDisableTitle')}</DialogTitle><DialogDescription>{t('session.s2sDisableHint')}</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="secondary" onClick={() => setConfirmS2sOff(false)}>{t('common.cancel')}</Button>
        <Button disabled={pendingSettings > 0} onClick={() => void perform(async () => {
          await updateSettings({ realtime: { s2sModel: null, defaultPipeline: 'cascade' } })
          setConfirmS2sOff(false)
        }, 'settings')}>{t('gateway.proxyDisabled')}</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={rotating} onOpenChange={setRotating}><DialogContent><DialogHeader><DialogTitle>{t('gateway.rotateTitle')}</DialogTitle><DialogDescription>{t('gateway.rotateDescription')}</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setRotating(false)}>{t('common.cancel')}</Button><Button disabled={keyBusy} onClick={() => void perform(async () => { const nextKey = await api.rotateKey(); if (key !== null) setKey(nextKey); setRotating(false) }, 'key')}>{t('gateway.rotate')}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
