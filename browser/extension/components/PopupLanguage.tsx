import { Combobox } from '@base-ui/react/combobox'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Button } from '../../../src/renderer/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '../../../src/renderer/components/ui/input-group'
import type { ChoiceOption } from './ChoiceField'
import type { browserText } from '../i18n'

export function PopupLanguage({ label, value, options, onChange, t }: { label: string; value: string; options: ChoiceOption[]; onChange(value: string): void; t: ReturnType<typeof browserText> }) {
  const selected = options.find(option => option.value === value) ?? options[0]
  return <Combobox.Root items={options} value={selected} onValueChange={option => { if (option) onChange(option.value) }} itemToStringLabel={option => option.label} isItemEqualToValue={(a, b) => a.value === b.value}>
    <Combobox.Trigger render={<Button variant="outline" className="nola-popup-language-card" aria-label={label} title={selected?.label} />}>
      <span><strong>{selected?.label}</strong><small>{label}</small></span><ChevronDown />
    </Combobox.Trigger>
    <Combobox.Portal><Combobox.Positioner sideOffset={8} align="start" className="z-popup">
      <Combobox.Popup className="select__popover nola-popup-language-list">
        <InputGroup><InputGroupAddon><Search /></InputGroupAddon><Combobox.Input aria-label={t('searchLanguages')} placeholder={t('searchLanguages')} render={<InputGroupInput />} /></InputGroup>
        <Combobox.Empty className="nola-muted">{t('noLanguages')}</Combobox.Empty>
        <Combobox.List>{(option: ChoiceOption) => <Combobox.Item key={option.value} value={option} className="select__item"><span>{option.label}</span><Combobox.ItemIndicator><Check /></Combobox.ItemIndicator></Combobox.Item>}</Combobox.List>
      </Combobox.Popup>
    </Combobox.Positioner></Combobox.Portal>
  </Combobox.Root>
}
