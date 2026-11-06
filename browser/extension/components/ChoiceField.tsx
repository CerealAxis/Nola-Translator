import { useId, useState } from 'react'
import { Combobox, ComboboxTrigger, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from '../../../src/renderer/components/ui/combobox'
import { resolveUiLanguage } from '../../../src/shared/languages'
import { Field, FieldLabel } from '../../../src/renderer/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../src/renderer/components/ui/select'
import { browserText } from '../i18n'

export interface ChoiceOption { value: string; label: string; disabled?: boolean }
export interface ChoiceFieldProps { label: string; value: string; options: ChoiceOption[]; disabled?: boolean; onChange: (value: string) => void; t?: ReturnType<typeof browserText> }
export function ChoiceField({ label, value, options, disabled, onChange, t = browserText(resolveUiLanguage('auto', document.documentElement.lang || navigator.language)) }: ChoiceFieldProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const id = useId()
  if (options.length > 7) return <Field data-disabled={disabled || undefined}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Combobox disabled={disabled} items={options} value={options.find(option => option.value === value) ?? null} onValueChange={option => { if (option) onChange(option.value) }} itemToStringLabel={option => option.label} isItemEqualToValue={(a, b) => a.value === b.value}>
      <ComboboxTrigger id={id} className="nola-choice-search-trigger"><span className="select__value">{options.find(option => option.value === value)?.label ?? label}</span></ComboboxTrigger>
      <div ref={setContainer} style={{ display: 'contents' }} />
      {container && <ComboboxContent container={container} className="nola-choice-search-list">
        <ComboboxInput aria-label={t('searchOptions')} placeholder={t('searchOptions')} />
        <ComboboxEmpty>{t('noResults')}</ComboboxEmpty>
        <ComboboxList>{(option: ChoiceOption) => <ComboboxItem key={option.value} value={option} disabled={option.disabled}>{option.label}</ComboboxItem>}</ComboboxList>
      </ComboboxContent>}
    </Combobox>
  </Field>
  return <Field data-disabled={disabled || undefined}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select value={value} items={options} disabled={disabled} onValueChange={value => { if (value !== null) onChange(value) }}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <div ref={setContainer} style={{ display: 'contents' }} />
      {container && <SelectContent container={container}><SelectGroup>{options.map(option => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>}
    </Select>
  </Field>
}
