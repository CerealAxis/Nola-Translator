import { useState } from 'react'
import { Select, SelectContent, SelectFieldLabel, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown } from 'lucide-react'

import type { ComputeSettings } from '../../../shared/compute'
import { isModelReady, recognitionLanguages, supportsTranslation } from '../../../shared/model-capabilities'
import { supportsSelectedEngine } from '../../../shared/model-engines'
import { languageName } from '@/bridge'
import type { ResourceRecord } from '@/bridge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/i18n'

export interface TranslationCompatibilityDialogProps {
  isOpen: boolean
  onClose: () => void
  source: string
  target: string
  recognition: ResourceRecord | undefined
  translation: ResourceRecord | undefined
  resources: readonly ResourceRecord[]
  compute: ComputeSettings
  onChangeSource: (source: string) => void
  onChangeModel: (modelId: string) => void
  onDisableTranslation: () => void
}

/** Row states follow DESIGN §8: highlight while navigating, accent-soft once the row is the current value. */
const ITEM_CLASS = 'flex cursor-default items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm data-[highlighted]:bg-surface-tertiary data-[selected]:bg-accent-soft data-[selected]:text-accent aria-disabled:opacity-50'

export function TranslationCompatibilityDialog(props: TranslationCompatibilityDialogProps) {
  const { t, language } = useI18n()
  const [choice, setChoice] = useState<'model' | 'language' | null>(null)
  const label = (code: string) => languageName(code, language)
  const translationModels = props.resources.filter(model => model.kind === 'translationModel' && model.installed)
  const sourceLanguages = recognitionLanguages(props.recognition)
  return (
    <Dialog open={props.isOpen} onOpenChange={open => { if (!open) props.onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle data-slot="dialog-title">{t('modelConfig.incompatibleTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-[var(--space-2)]">
          <p className="text-muted">{t('modelConfig.incompatibleBody', { name: props.translation?.name ?? '', source: label(props.source), target: label(props.target) })}</p>
          {choice === 'model' ? (
            <Select value={props.translation?.resourceId ?? null} onValueChange={key => { if (typeof key === 'string') { props.onChangeModel(key); props.onClose() } }}>
              <SelectFieldLabel className="w-fit text-sm font-medium text-foreground">{t('session.translationModel')}</SelectFieldLabel>
              <SelectTrigger className="select__trigger w-full">
                <SelectValue className="select__value">{value => translationModels.find(model => model.resourceId === value)?.name ?? ''}</SelectValue>

              </SelectTrigger>
              <SelectContent className="select__popover rounded-xl border border-border bg-overlay p-1 shadow-overlay" style={{ minWidth: 'var(--anchor-width)' }}><SelectGroup className="flex flex-col">
                      {translationModels.map(model => (
                        <SelectItem key={model.resourceId} value={model.resourceId} label={model.name} className={ITEM_CLASS}
                          disabled={!isModelReady(model) || !supportsSelectedEngine(model, props.compute, model.resourceId) || !supportsTranslation(model, props.source, props.target)}>
                          {model.name}

                        </SelectItem>
                      ))}
                    </SelectGroup></SelectContent>
            </Select>
          ) : null}
          {choice === 'language' ? (
            <Select value={props.source} onValueChange={key => { if (typeof key === 'string') { props.onChangeSource(key); props.onClose() } }}>
              <SelectFieldLabel className="w-fit text-sm font-medium text-foreground">{t('session.sourceLanguage')}</SelectFieldLabel>
              <SelectTrigger className="select__trigger w-full">
                <SelectValue className="select__value">{value => label(String(value ?? ''))}</SelectValue>

              </SelectTrigger>
              <SelectContent className="select__popover rounded-xl border border-border bg-overlay p-1 shadow-overlay" style={{ minWidth: 'var(--anchor-width)' }}><SelectGroup className="flex flex-col">
                      {sourceLanguages.map(code => (
                        <SelectItem key={code} value={code} label={label(code)} className={ITEM_CLASS} disabled={!supportsTranslation(props.translation, code, props.target)}>
                          {label(code)}

                        </SelectItem>
                      ))}
                    </SelectGroup></SelectContent>
            </Select>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setChoice('model')}>{t('modelConfig.changeModel')}</Button>
          <Button variant="secondary" onClick={() => setChoice('language')}>{t('modelConfig.changeLanguage')}</Button>
          <Button onClick={() => { props.onDisableTranslation(); props.onClose() }}>{t('modelConfig.disableTranslation')}</Button>
          <Button variant="tertiary" onClick={props.onClose}>{t('common.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
