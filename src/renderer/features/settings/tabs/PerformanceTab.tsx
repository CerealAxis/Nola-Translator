import { translationEngine } from '../../../../shared/model-engines'
import { useState } from 'react'
import { Alert, Button } from '@heroui/react'
import { useI18n } from '@/i18n'
import { updateSettings, stores, useStore } from '@/store'
import { DEFAULT_COMPUTE_SETTINGS, type ComputeSettings } from '../../../../shared/compute'
import { SettingsRow } from '../SettingsRow'
import { SettingGroup, SettingSelect, type SettingsPanelProps } from '../SettingsPage'
import { computeUi } from '../compute-ui'

export function PerformanceTab({ settings }: SettingsPanelProps) {
  const { language } = useI18n()
  const c = language === 'en' ? computeUi.en : computeUi.zh
  const compute = settings.compute ?? DEFAULT_COMPUTE_SETTINGS
  const resources = useStore(stores.models, state => state.resources)
  const adapter = resources.find(r => r.resourceId === settings.translation.localModelId)?.provider
  const localTranslation = settings.translation.provider === 'local'
  const translationUsesTorch = localTranslation && translationEngine(compute, adapter, settings.translation.localModelId) === 'pytorch'
  const usesTorch = compute.recognitionEngine === 'pytorch' || translationUsesTorch
  const usesLlama = compute.recognitionEngine === 'llama' || (localTranslation && !translationUsesTorch)
  const [error, setError] = useState('')
  const save = (patch: Partial<ComputeSettings>) => {
    setError('')
    void updateSettings({ compute: patch }).catch(e => setError(`${c.saveError}: ${String(e)}`))
  }
  const numeric = (field: 'reservedVramMb' | 'cpuThreads' | 'gpuLayers' | 'contextSize', label: string, desc: string, min: number, max: number) =>
    <SettingsRow descriptionTooltip label={label} desc={desc}><NumberSetting value={compute[field]} min={min} max={max} label={label} onSave={value => save({ [field]: value })} /></SettingsRow>
  return <div className="settings-panel">
    {error ? <Alert status="danger"><Alert.Content><Alert.Description>{error}</Alert.Description></Alert.Content></Alert> : null}
    <p className="compute-hint">{c.nextSession}</p>
    {usesTorch ? <SettingGroup legend="PyTorch">
      <SettingsRow descriptionTooltip label={c.precision} desc={c.precisionHint}><SettingSelect ariaLabel={c.precision} value={compute.precision} options={[{ value: 'auto', label: c.automatic }, ...['fp32', 'fp16', 'bf16'].map(value => ({ value, label: value.toUpperCase() }))]} onChange={value => save({ precision: value as ComputeSettings['precision'] })} /></SettingsRow>
      <SettingsRow descriptionTooltip label={c.quantization} desc={c.quantHint}><SettingSelect ariaLabel={c.quantization} value={compute.quantization} options={[{ value: 'auto', label: c.automatic }, { value: 'none', label: c.none }, { value: 'nf4', label: 'NF4' }, { value: '8bit', label: '8bit' }]} onChange={value => save({ quantization: value as ComputeSettings['quantization'] })} /></SettingsRow>
    </SettingGroup> : null}
    <SettingGroup legend={language === 'en' ? 'Memory and CPU' : '显存与 CPU'} actions={<Button variant="secondary" size="sm" onPress={() => save({ precision: 'auto', quantization: 'auto', reservedVramMb: 1024, cpuThreads: 0, gpuLayers: -1, contextSize: 2048, flashAttention: 'auto' })}>{c.restore}</Button>}>
      {numeric('reservedVramMb', c.reserve, c.reserveHint, 256, 65536)}
      {numeric('cpuThreads', c.threads, c.threadsHint, 0, 256)}
    </SettingGroup>
    {usesLlama ? <SettingGroup legend="llama.cpp">
      {numeric('gpuLayers', c.layers, c.layersHint, -1, 1000)}
      {numeric('contextSize', c.context, c.contextHint, 512, 32768)}
      <SettingsRow descriptionTooltip label={c.flash} desc={c.flashHint}><SettingSelect ariaLabel={c.flash} value={compute.flashAttention} options={[{ value: 'auto', label: c.automatic }, { value: 'on', label: c.on }, { value: 'off', label: c.off }]} onChange={value => save({ flashAttention: value as ComputeSettings['flashAttention'] })} /></SettingsRow>
    </SettingGroup> : null}
  </div>
}

function NumberSetting({ value, min, max, label, onSave }: { value: number; min: number; max: number; label: string; onSave: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return <input className="compute-number" type="number" aria-label={label} min={min} max={max} step={1} value={draft ?? String(value)}
    onChange={e => setDraft(e.target.value)} onBlur={() => {
      const next = Number(draft)
      if (draft !== null && draft !== '' && Number.isInteger(next) && next >= min && next <= max) onSave(next)
      setDraft(null)
    }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
}
