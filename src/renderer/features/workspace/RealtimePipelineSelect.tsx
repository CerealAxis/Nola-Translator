import { useI18n } from '@/i18n'
import { notifyWarning } from '@/components/primitives/notify'
import { REALTIME_S2S_MODELS, type RealtimeS2sModel } from '../../../shared/settings'
import { SettingSelect } from '../settings/SettingsPage'
import { ModelAvailabilityLabel } from './ModelAvailabilityLabel'

export const realtimeS2sNames: Record<RealtimeS2sModel, string> = {
  'qwen3.8-livetranslate-flash-realtime': 'Qwen3.8 LiveTranslate',
  'qwen3.5-livetranslate-flash-realtime': 'Qwen3.5 LiveTranslate',
}

export function RealtimePipelineLabel({ followDefault = false }: { followDefault?: boolean }) {
  const { t } = useI18n()
  return <ModelAvailabilityLabel label={t('session.pipeline')} hint={<div className="flex max-w-80 flex-col gap-2 whitespace-normal">
    {followDefault ? <p><strong>{t('session.followDefault')}</strong><br />{t('session.followDefaultHint')}</p> : null}
    <p><strong>{t('session.cascade')}</strong><br />{t('session.cascadeHint')}</p>
    <p><strong>{t('session.directSpeech')}</strong><br />{t('session.directSpeechHint')}</p>
  </div>} />
}

type ProcessingMode = 'default' | 'cascade' | 's2s'

export function RealtimeProcessingField({ value, onChange, disabled, className, id }: {
  value: ProcessingMode
  onChange: (value: ProcessingMode) => void
  disabled?: boolean
  className?: string
  id?: string
}) {
  const { t } = useI18n()
  return <div data-slot="field" className={className}>
    <RealtimePipelineLabel followDefault />
    <SettingSelect id={id} ariaLabel={t('session.pipeline')} isDisabled={disabled} value={value} options={[
      { value: 'default', label: t('session.followDefault') },
      { value: 'cascade', label: t('session.cascade') },
      { value: 's2s', label: t('session.directSpeech') },
    ]} onChange={next => { if (next === 'default' || next === 'cascade' || next === 's2s') onChange(next) }} />
  </div>
}

export function RealtimePipelineFields({ model, gatewayModel, s2sReady, onChange, disabled, className, hideInheritedModel }: {
  model: RealtimeS2sModel | null | undefined
  gatewayModel: RealtimeS2sModel | null
  s2sReady: boolean
  onChange: (model: RealtimeS2sModel | null | undefined) => void
  disabled?: boolean
  className?: string
  hideInheritedModel?: boolean
}) {
  const { t } = useI18n()
  const effectiveModel = model === undefined ? gatewayModel : model
  return <>
    <RealtimeProcessingField className={className} disabled={disabled} value={model === undefined ? 'default' : model ? 's2s' : 'cascade'} onChange={value => {
      if (!s2sReady && (value === 's2s' || value === 'default' && gatewayModel)) {
        notifyWarning(t('session.s2sModelRequired'))
        return
      }
      onChange(value === 'default' ? undefined : value === 's2s' ? effectiveModel ?? REALTIME_S2S_MODELS[0] : null)
    }} />
    {s2sReady && effectiveModel && (!hideInheritedModel || model !== undefined) ? <div className={className}>
      <ModelAvailabilityLabel label={t('models.s2sModels')} hint={t('models.s2sModelsHint')} />
      {model === undefined ? <span>{realtimeS2sNames[effectiveModel]} · {t('session.followDefault')}</span>
        : <SettingSelect ariaLabel={t('models.s2sModels')} isDisabled={disabled} value={effectiveModel}
          options={REALTIME_S2S_MODELS.map(value => ({ value, label: realtimeS2sNames[value] }))}
          onChange={value => { const selected = REALTIME_S2S_MODELS.find(item => item === value); if (selected) onChange(selected) }} />}
    </div> : null}
  </>
}
