import { Combobox } from '@base-ui/react/combobox'
import { ArrowRightLeft, Check, ChevronDown } from 'lucide-react'
import { useI18n } from '@/i18n'
import { languageName, normalizeLanguage, type UiLanguage } from '../../../shared/languages'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TooltipHint, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function languageOptionLabel(code: string, locale: UiLanguage, includeNative = true): string {
  const normalized = normalizeLanguage(code)
  const localized = locale === 'zh-CN' && normalized === 'zh' ? '简体中文'
    : locale === 'zh-CN' && normalized === 'zh-Hant' ? '繁体中文' : languageName(code, locale)
  if (!includeNative || normalized === 'auto' || normalized === 'none') return localized
  let native = normalized === 'zh' ? '简体中文' : normalized === 'zh-Hant' ? '繁體中文' : normalized === 'yue' ? '粵語' : ''
  if (!native) {
    try { native = new Intl.DisplayNames([normalized === 'ns' ? 'nso' : normalized], { type: 'language', fallback: 'none' }).of(normalized === 'ns' ? 'nso' : normalized) ?? '' }
    catch { /* Keep the localized name for languages missing from ICU. */ }
  }
  return native && native !== localized ? `${localized} (${native})` : localized
}

export function LanguageSelect({ value, codes, label, onChange, disabled }: {
  value: string; codes: readonly string[]; label: string; onChange(value: string): void; disabled?: boolean
}) {
  const { t, language } = useI18n()
  const name = (code: string) => languageOptionLabel(code, language)
  return <Combobox.Root items={codes} itemToStringLabel={name} value={value} disabled={disabled || !codes.length} modal={false}
    onValueChange={next => { if (next) onChange(next) }}>
    <TooltipHint content={name(value)}><Combobox.Trigger className="select__trigger nola-language-trigger" aria-label={label}>
      <span className="select__value">{languageOptionLabel(value, language, false)}</span><ChevronDown aria-hidden="true" />
    </Combobox.Trigger></TooltipHint>
    <Combobox.Portal><Combobox.Positioner className="z-popup" sideOffset={4}>
      <Combobox.Popup className="select__popover nola-language-popup" initialFocus={false}>
        <Combobox.Input render={<Input />} placeholder={t('modelConfig.searchLanguages')} aria-label={t('modelConfig.searchLanguages')} />
        <Combobox.Empty className="nola-language-empty">{t('modelConfig.noLanguages')}</Combobox.Empty>
        <Combobox.List className="nola-language-list">{(code: string) => <Combobox.Item key={code} value={code} className="select__item">
          <span className="select__item-text">{name(code)}</span><Combobox.ItemIndicator className="select__item-indicator"><Check aria-hidden="true" /></Combobox.ItemIndicator>
        </Combobox.Item>}</Combobox.List>
      </Combobox.Popup>
    </Combobox.Positioner></Combobox.Portal>
  </Combobox.Root>
}

export function LanguageDirectionSelect({ source, target, sourceCodes, targetCodes, onSourceChange, onTargetChange, onSwap, disabled, sourceLabel, targetLabel, unavailable, requiredModels }: {
  source: string; target: string; sourceCodes: readonly string[]; targetCodes: readonly string[]
  onSourceChange(value: string): void; onTargetChange(value: string): void; onSwap?: () => void; disabled?: boolean
  sourceLabel?: string; targetLabel?: string
  unavailable?: 'gateway' | 'models' | 'pair'
  requiredModels?: readonly string[]
}) {
  const { t } = useI18n()
  const blocked = disabled || !!unavailable
  const hint = unavailable === 'gateway' ? 'gateway.languageStartHint'
    : unavailable === 'models' ? 'gateway.languageModelsHint' : 'gateway.languagePairHint'
  const controls = <div className="nola-language-direction" role="group" aria-label={t('shellUi.languageDirection')}>
    <LanguageSelect value={source} codes={sourceCodes} label={sourceLabel ?? t('session.sourceLanguage')} disabled={blocked} onChange={onSourceChange} />
    <Button variant="bare" size="icon-sm" disabled={blocked || !onSwap} aria-label={t('session.swapLanguages')} onClick={onSwap}><ArrowRightLeft aria-hidden="true" /></Button>
    <LanguageSelect value={target} codes={targetCodes} label={targetLabel ?? t('session.targetLanguage')} disabled={blocked} onChange={onTargetChange} />
  </div>
  return unavailable && !disabled ? <Tooltip>
    <TooltipTrigger render={controls} tabIndex={0} delay={0} />
    <TooltipContent>{unavailable !== 'pair' && requiredModels?.length
      ? t('gateway.languageRequiredModelsHint', { models: requiredModels.join(t('gateway.languageModelJoin')) })
      : t(hint)}</TooltipContent>
  </Tooltip> : controls
}
