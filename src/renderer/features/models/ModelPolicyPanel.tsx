import { useState } from 'react'
import { useI18n, type TranslationKey } from '@/i18n'
import { stores, updateSettings, useStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { notifyError } from '@/components/primitives/notify'
import { MODEL_CAPABILITIES, defaultModelBinding, defaultModelPatch, isModelEnabled, modelEnablePatch } from '../../../shared/model-policy'
import { configurationOf, isModelReady } from '../../../shared/model-capabilities'
import { supportsSelectedEngine, modelEngines } from '../../../shared/model-engines'
import { isEngineAvailable } from './engine-availability'
import { cloudModelsOf } from './CloudModels'
import { legacyFallbackReady } from '../../../shared/cloud-models'
import { installedPlaygroundModels } from '../workbench/installed-models'
import type { GatewayCapability } from '../../../shared/model-gateway'

const LABELS: Record<GatewayCapability, TranslationKey> = {
  asr: 'modelsPolicy.defaultAsr', mt: 'modelsPolicy.defaultMt', tts: 'modelsPolicy.defaultTts', llm: 'modelsPolicy.defaultLlm',
}

/** Management lists configured models even when disabled; business pickers use the enabled catalog. */
export function ModelPolicyPanel() {
  const { t } = useI18n()
  const settings = useStore(stores.settings, state => state.settings)
  const resources = useStore(stores.models, state => state.resources)
  const credentials = useStore(stores.models, state => state.credentials)
  const runtimes = useStore(stores.settings, state => state.runtimes)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  if (!settings) return null
  const clouds = cloudModelsOf(settings, credentials)
  const installedModels = installedPlaygroundModels(resources, settings, credentials, t)
  if (clouds.some(model => model.id === 'recognition' && model.ready)) installedModels.push({ id: 'cloud:recognition', name: t('settings.providerRecognitionTranslation'), kind: 'mt' })
  if (settings.translation.fallback.provider === 'cloud') installedModels.push({ id: 'mt-custom:legacy-fallback', name: `${t('gateway.fallbackModel')} · ${settings.translation.fallback.cloudModel}`, kind: 'mt' })
  const candidates = installedModels.map(model => {
    const resource = model.id.startsWith('resource:') ? resources.find(item => item.resourceId === model.id.slice(9)) : undefined
    const engine = resource ? modelEngines(resource)[0] : undefined
    const cloud = clouds.find(item => model.id === (item.profile ? model.kind === 'llm' ? item.id : `mt-custom:${item.profile.id}` : `cloud:${item.id}`))
    const ready = model.id === 'mt-custom:legacy-fallback' ? legacyFallbackReady(settings, credentials) : resource ? (resource.kind === 'ttsModel' ? resource.installed : isModelReady(resource) && !!configurationOf(resource)) &&
      supportsSelectedEngine(resource, settings.compute, resource.resourceId) && (!engine || !runtimes?.local || isEngineAvailable(engine, runtimes.local)) : !!cloud?.ready
    return { ...model, ready }
  })
  const save = async (patch: Parameters<typeof updateSettings>[0]) => {
    setSaving(true)
    try { await updateSettings(patch) }
    catch (cause) { notifyError(t('modelsSettingsUi.saveError'), { cause }) }
    finally { setSaving(false) }
  }
  return <><Button variant="secondary" onClick={() => setOpen(true)}>{t('modelsPolicy.title')}</Button>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="model-configuration-dialog modal__dialog modal__dialog--lg">
    <DialogCloseButton aria-label={t('common.close')} />
    <DialogHeader><DialogTitle>{t('modelsPolicy.title')}</DialogTitle></DialogHeader>
    <div className="model-configuration-dialog__body grid gap-4 md:grid-cols-2">{MODEL_CAPABILITIES.map(kind => {
      const models = candidates.filter(model => model.kind === kind)
      const enabled = models.filter(model => model.id !== 'mt-custom:legacy-fallback' && model.ready && isModelEnabled(settings, kind, model.id))
      const current = defaultModelBinding(settings, kind)
      const selected = enabled.find(model => model.id === current)
      return <Card key={kind} className="flex min-w-0 flex-col gap-3 p-4">
        <Tooltip><TooltipTrigger render={<label htmlFor={`model-default-${kind}`} />} className="nola-body-strong">{t(LABELS[kind])}</TooltipTrigger>
          <TooltipContent className="z-popup max-w-96 whitespace-normal">{t('modelsPolicy.defaultHint')}</TooltipContent></Tooltip>
        <Select value={selected?.id ?? null} disabled={saving || !enabled.length} onValueChange={value => { if (value) void save(defaultModelPatch(settings, kind, value)) }}>
          <SelectTrigger id={`model-default-${kind}`}><SelectValue>{selected?.name ?? t(enabled.length ? 'modelsSettingsUi.noModelSelected' : 'modelsPolicy.noEnabled')}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup>{enabled.map(model => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
        {models.map(model => {
          const active = isModelEnabled(settings, kind, model.id)
          return <div key={model.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate nola-caption">{model.name}</span>
            <Tooltip><TooltipTrigger render={<span />} tabIndex={0}>
              <Button variant="secondary" size="sm" aria-label={`${t(active ? 'modelsPolicy.disable' : 'modelsPolicy.enable')} ${model.name}`} aria-pressed={active}
                disabled={saving || (!active && !model.ready)} onClick={() => void save(modelEnablePatch(settings, kind, model.id, !active))}>
                {t(active ? 'modelsPolicy.enabled' : 'modelsPolicy.disabled')}
              </Button>
            </TooltipTrigger><TooltipContent className="z-popup max-w-96 whitespace-normal">{t(!model.ready ? 'modelsSettingsUi.configureBeforeDefault' : 'modelsPolicy.enableHint')}</TooltipContent></Tooltip>
          </div>
        })}
      </Card>
    })}</div>
  </DialogContent></Dialog></>
}
