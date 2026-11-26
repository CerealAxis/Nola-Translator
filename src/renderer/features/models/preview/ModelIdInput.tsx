import { useRef } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { ChevronDown, Check } from 'lucide-react'
import { useI18n } from '@/i18n'
import { ttsText } from '@/i18n/tts-ui'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group'

export function ModelIdInput({ id, value, options, disabledOptions, label, onChange }: {
  id: string; value: string; options: string[]; disabledOptions: string[]; label: string; onChange(value: string): void;
}) {
  const anchor = useRef<HTMLDivElement>(null)
  const { language } = useI18n()
  return <Combobox.Root items={options} value={value || null} inputValue={value}
    onInputValueChange={(next, details) => { if (details.reason === 'input-change' || details.reason === 'input-clear') onChange(next) }}
    onValueChange={next => { if (typeof next === 'string') onChange(next) }}>
    <InputGroup ref={anchor}>
      <Combobox.Input id={id} aria-label={label} maxLength={256} autoComplete="off" spellCheck={false} render={<InputGroupInput />} />
      <InputGroupAddon align="inline-end"><Combobox.Trigger render={<Button variant="bare" size="icon-xs" aria-label={ttsText(language, 'modelOptions')} />}><ChevronDown aria-hidden="true" /></Combobox.Trigger></InputGroupAddon>
    </InputGroup>
    <Combobox.Portal><Combobox.Positioner anchor={anchor} sideOffset={4} className="z-popup">
      <Combobox.Popup className="select__popover settings-select-content">
        <Combobox.List className="combobox__list">{(item: string) => <Combobox.Item key={item} value={item} disabled={disabledOptions.includes(item)} className="select__item">
          <span className="select__item-text">{item}</span><Combobox.ItemIndicator><Check aria-hidden="true" /></Combobox.ItemIndicator>
        </Combobox.Item>}</Combobox.List>
      </Combobox.Popup>
    </Combobox.Positioner></Combobox.Portal>
  </Combobox.Root>
}
