import { useId, useState } from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Combobox } from '@base-ui/react/combobox'
import { Check, ChevronDown, Search } from 'lucide-react'
import { resolveUiLanguage } from '../../../src/shared/languages'
import { Button } from '../../../src/renderer/components/ui/button'
import { Field, FieldLabel } from '../../../src/renderer/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '../../../src/renderer/components/ui/input-group'
import { Select, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../src/renderer/components/ui/select'
import { browserText } from '../i18n'

export interface ChoiceOption { value: string; label: string; disabled?: boolean }
export interface ChoiceFieldProps { label: string; value: string; options: ChoiceOption[]; disabled?: boolean; onChange: (value: string) => void; t?: ReturnType<typeof browserText> }
export function ChoiceField({ label, value, options, disabled, onChange, t = browserText(resolveUiLanguage('auto', document.documentElement.lang || navigator.language)) }: ChoiceFieldProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const id = useId()
  if (options.length > 7) return <Field data-disabled={disabled || undefined}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Combobox.Root disabled={disabled} items={options} value={options.find(option => option.value === value) ?? null} onValueChange={option => { if (option) onChange(option.value) }} itemToStringLabel={option => option.label} isItemEqualToValue={(a, b) => a.value === b.value}>
      <Combobox.Trigger id={id} render={<Button variant="outline" className="nola-choice-search-trigger" />}><span>{options.find(option => option.value === value)?.label ?? label}</span><ChevronDown /></Combobox.Trigger>
      <div ref={setContainer} style={{ display: 'contents' }} />
      {container && <Combobox.Portal container={container}><Combobox.Positioner sideOffset={4} align="start" className="isolate z-popup">
        <Combobox.Popup className="select__popover nola-choice-search-list">
          <InputGroup><InputGroupAddon><Search /></InputGroupAddon><Combobox.Input aria-label={t('searchOptions')} placeholder={t('searchOptions')} render={<InputGroupInput />} /></InputGroup>
          <Combobox.Empty className="nola-muted">{t('noResults')}</Combobox.Empty>
          <Combobox.List>{(option: ChoiceOption) => <Combobox.Item key={option.value} value={option} disabled={option.disabled} className="select__item"><span>{option.label}</span><Combobox.ItemIndicator><Check /></Combobox.ItemIndicator></Combobox.Item>}</Combobox.List>
        </Combobox.Popup>
      </Combobox.Positioner></Combobox.Portal>}
    </Combobox.Root>
  </Field>
  return <Field data-disabled={disabled || undefined}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select value={value} items={options} disabled={disabled} onValueChange={value => { if (value !== null) onChange(value) }}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <div ref={setContainer} style={{ display: 'contents' }} />
      {container && <SelectPrimitive.Portal container={container}>
        <SelectPrimitive.Positioner sideOffset={4} align="start" className="isolate z-popup">
          <SelectPrimitive.Popup className="select__popover" data-slot="select-content">
            <SelectPrimitive.List><SelectGroup>{options.map(option => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectGroup></SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>}
    </Select>
  </Field>
}
