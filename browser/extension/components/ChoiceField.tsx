import { useId, useState } from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Field, FieldLabel } from '../../../src/renderer/components/ui/field'
import { Select, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../src/renderer/components/ui/select'

export interface ChoiceOption { value: string; label: string; disabled?: boolean }
export interface ChoiceFieldProps { label: string; value: string; options: ChoiceOption[]; disabled?: boolean; onChange: (value: string) => void }
export function ChoiceField({ label, value, options, disabled, onChange }: ChoiceFieldProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const id = useId()
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
