import { useId, useState } from 'react'
import { Button, ListBox } from '@heroui/react'

export interface ChoiceOption { value: string; label: string; disabled?: boolean }
export interface ChoiceFieldProps { label: string; value: string; options: ChoiceOption[]; disabled?: boolean; onChange: (value: string) => void }
export function ChoiceField({ label, value, options, disabled, onChange }: ChoiceFieldProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <div className="nola-choice">
    <div className="nola-row"><span id={`${id}-label`}>{label}</span><Button variant="secondary" size="sm" isDisabled={disabled} aria-labelledby={`${id}-label`} aria-expanded={open && !disabled} aria-controls={id} onPress={() => setOpen(!open)}>{options.find(option => option.value === value)?.label ?? label}</Button></div>
    {open && !disabled && <ListBox id={id} aria-label={label} className="nola-options" selectionMode="single" selectedKeys={options.some(option => option.value === value) ? new Set([value]) : new Set()} disabledKeys={new Set(options.filter(option => option.disabled).map(option => option.value))} onSelectionChange={keys => {
      if (keys === 'all') return
      const next = [...keys][0]
      if (next !== undefined) { onChange(String(next)); setOpen(false) }
    }}>{options.map(option => <ListBox.Item key={option.value} id={option.value} textValue={option.label}>{option.label}<ListBox.ItemIndicator /></ListBox.Item>)}</ListBox>}
  </div>
}
