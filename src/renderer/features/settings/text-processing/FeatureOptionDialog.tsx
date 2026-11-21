import { useId, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { useI18n, type TranslationKey } from '@/i18n'
import { SettingSelect } from '../SettingsPage'
import { runPreprocessingPreview } from './text-processing-engine'
import type { ProcessingFeature } from './text-processing-features'
import { readPreviewSetting, useProcessingPreview, type FeatureOptions } from './text-processing-preview'

const DEFAULT_OPTIONS: FeatureOptions = {
  form: 'NFKC',
  count: '1',
  keepEnd: true,
  keepSingle: true,
  vndbId: '',
  vndbTargets: { replace: true, glossary: true },
}

const PREVIEW_SAMPLE: Record<string, string> = {
  normalize: 'ＡＢＣ　１２３　ｶﾞｷﾞｸﾞ',
  lines: '第一行对话\n第二行对话\n第三行对话',
  'repeat-chars': 'AAAABBBBCCCCD',
  'repeat-block': 'ABCDABCDABCD',
}

export function FeatureOptionFormBody({
  feature,
  draft,
  setDraft,
  id,
  invalid,
}: {
  feature: ProcessingFeature
  draft: FeatureOptions
  setDraft: (next: FeatureOptions) => void
  id: string
  invalid: boolean
}) {
  const { t } = useI18n()
  const numeric = feature.editor === 'lines' || feature.editor === 'repeat'
  const max = feature.editor === 'lines' ? 99999999 : 10000
  const countLabel = feature.editor === 'lines' ? 'suite.textLineCount' : 'suite.textRepeatCount'
  const vndbValue = (draft.vndbId ?? '').trim()
  const vndbInvalid = feature.editor === 'vndb' && vndbValue.length > 0 && !/^v?\d+$/i.test(vndbValue)

  function flag(key: 'keepEnd' | 'keepSingle', label: TranslationKey) {
    return (
      <Field className="flex flex-row items-center justify-between gap-4">
        <FieldLabel htmlFor={id + key}>{t(label)}</FieldLabel>
        <Switch
          id={id + key}
          checked={draft[key] ?? false}
          onCheckedChange={checked => setDraft({ ...draft, [key]: checked })}
        >
          <SwitchThumb />
        </Switch>
      </Field>
    )
  }

  const sample = PREVIEW_SAMPLE[feature.id]
  const previewResult = useProcessingPreview(sample ?? '', () => sample
    ? runPreprocessingPreview(sample, [feature.id], { [feature.id]: true }, { [feature.id]: draft }, [])
    : '', feature.id, draft)

  return (
    <FieldGroup>
      {feature.editor === 'normalize' && (
        <Field>
          <FieldLabel htmlFor={id}>{t('suite.textForm')}</FieldLabel>
          <SettingSelect
            id={id}
            value={draft.form ?? 'NFKC'}
            ariaLabel={t('suite.textForm')}
            options={['NFC', 'NFD', 'NFKC', 'NFKD'].map(value => ({ value, label: value }))}
            onChange={form => setDraft({ ...draft, form })}
          />
        </Field>
      )}
      {numeric && (
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor={id}>{t(countLabel)}</FieldLabel>
          <Input
            id={id}
            type="number"
            min={1}
            max={max}
            aria-invalid={invalid || undefined}
            value={draft.count ?? ''}
            onChange={event => setDraft({ ...draft, count: event.target.value })}
          />
          {feature.editor === 'repeat' && <FieldDescription>{t('suite.textAutoRepeat')}</FieldDescription>}
        </Field>
      )}
      {feature.editor === 'lines' && flag('keepEnd', 'suite.textKeepEnd')}
      {feature.id === 'repeat-chars' && flag('keepSingle', 'suite.textKeepSingle')}
      {feature.editor === 'vndb' && (
        <>
          <Field data-invalid={vndbInvalid || undefined}>
            <FieldLabel htmlFor={id}>{t('suite.textVndbId')}</FieldLabel>
            <Input
              id={id}
              placeholder="v1234"
              aria-invalid={vndbInvalid || undefined}
              value={draft.vndbId ?? ''}
              onChange={event => setDraft({ ...draft, vndbId: event.target.value })}
            />
            {vndbInvalid && <FieldDescription className="text-danger">{t('suite.textVndbInvalidId')}</FieldDescription>}
          </Field>
          <Field>
            <FieldLabel>{t('suite.textVndbTarget')}</FieldLabel>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 type-body">
                <Checkbox
                  checked={draft.vndbTargets?.replace ?? true}
                  onCheckedChange={checked =>
                    setDraft({
                      ...draft,
                      vndbTargets: { replace: Boolean(checked), glossary: draft.vndbTargets?.glossary ?? true },
                    })
                  }
                />
                <span>{t('suite.textVndbTargetReplace')}</span>
              </label>
              <label className="flex items-center gap-2 type-body">
                <Checkbox
                  checked={draft.vndbTargets?.glossary ?? true}
                  onCheckedChange={checked =>
                    setDraft({
                      ...draft,
                      vndbTargets: { replace: draft.vndbTargets?.replace ?? true, glossary: Boolean(checked) },
                    })
                  }
                />
                <span>{t('suite.textVndbTargetGlossary')}</span>
              </label>
            </div>
          </Field>
        </>
      )}
      {sample && (
        <div className="rounded-[var(--radius-md)] border border-nola-ui-border bg-nola-ui-muted/50 p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="type-small text-nola-ui-muted-foreground">{t('suite.textPreviewOutput')}</span>
            <Badge variant="secondary">{feature.id === 'normalize' ? (draft.form ?? 'NFKC') : t('suite.textPreviewTest')}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-1.5 type-code sm:grid-cols-2">
            <pre className="m-0 overflow-x-auto whitespace-pre-wrap text-nola-ui-muted-foreground">{sample}</pre>
            <pre className="m-0 overflow-x-auto whitespace-pre-wrap text-foreground">{previewResult}</pre>
          </div>
        </div>
      )}
    </FieldGroup>
  )
}

export function validateFeatureOptions(feature: ProcessingFeature, draft: FeatureOptions): boolean {
  if (feature.editor === 'lines' || feature.editor === 'repeat') {
    const count = Number(draft.count)
    const max = feature.editor === 'lines' ? 99999999 : 10000
    return !Number.isInteger(count) || count < 1 || count > max
  }
  if (feature.editor === 'vndb') {
    const vndbValue = (draft.vndbId ?? '').trim()
    return vndbValue.length > 0 && !/^v?\d+$/i.test(vndbValue)
  }
  return false
}

export function FeatureOptionDialog({
  feature,
  open,
  onOpenChange,
  onSave,
}: {
  feature: ProcessingFeature | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (featureId: string, options: FeatureOptions) => Promise<boolean>
}) {
  const { t } = useI18n()
  const id = useId()
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<FeatureOptions>(() =>
    feature ? { ...DEFAULT_OPTIONS, ...readPreviewSetting<FeatureOptions>('options:' + feature.id, DEFAULT_OPTIONS) } : DEFAULT_OPTIONS,
  )

  if (!feature) return null
  const invalid = validateFeatureOptions(feature, draft)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(feature.label)}</DialogTitle>
          {feature.example && <DialogDescription>{feature.example}</DialogDescription>}
          <DialogCloseButton disabled={saving} />
        </DialogHeader>
        <form
          onSubmit={event => {
            event.preventDefault()
            if (invalid || saving) return
            setSaving(true)
            void onSave(feature.id, draft).then(saved => {
              if (saved) onOpenChange(false)
            }).finally(() => setSaving(false))
          }}
        >
          <CardContent className="px-0 pb-4">
            <FeatureOptionFormBody feature={feature} draft={draft} setDraft={setDraft} id={id} invalid={invalid} />
          </CardContent>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={invalid || saving}>
              {t('suite.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function FeatureOptionCard({
  feature,
  draft,
  setDraft,
  back,
  onSave,
}: {
  feature: ProcessingFeature
  draft: FeatureOptions
  setDraft: (next: FeatureOptions) => void
  back: string
  onSave: () => void
}) {
  const { t } = useI18n()
  const id = useId()
  const invalid = validateFeatureOptions(feature, draft)

  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        if (!invalid) onSave()
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t(feature.label)}</CardTitle>
          {feature.example && <CardDescription>{feature.example}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FeatureOptionFormBody feature={feature} draft={draft} setDraft={setDraft} id={id} invalid={invalid} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" nativeButton={false} render={<a href={back} />}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={invalid}>
              {t('suite.save')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
