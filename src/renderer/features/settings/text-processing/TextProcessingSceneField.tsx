import { useId } from 'react'
import { Field, FieldLabel } from '@/components/ui/field'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { useI18n } from '@/i18n'
import { usePreviewSetting } from './text-processing-preview'

export function TextProcessingSceneField({ scene, disabled }: { scene: string; disabled?: boolean }) {
  const id = useId()
  const { t } = useI18n()
  const [enabled, setEnabled] = usePreviewSetting('scene:' + scene, true)

  return (
    <Field className="nola-settings-field text-processing-scene">
      <FieldLabel htmlFor={id}>{t('suite.textProcessing')}</FieldLabel>
      <Switch id={id} checked={enabled} onCheckedChange={setEnabled} disabled={disabled}
        aria-description={t('suite.textSceneSupport')}>
        <SwitchThumb />
      </Switch>
    </Field>
  )
}
