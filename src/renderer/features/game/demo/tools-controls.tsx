import { useId } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch, SwitchThumb } from '@/components/ui/switch'

export function Choice<T extends string>({
  title,
  value,
  onChange,
  options,
}: {
  title: string
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<readonly [T, string]>
}) {
  const id = useId()
  return (
    <div className="gt-tool-field">
      <label htmlFor={id}>{title}</label>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next)
        }}
      >
        <SelectTrigger id={id} aria-label={title}>
          <SelectValue>{options.find(([id]) => id === value)?.[1]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(([id, name]) => (
            <SelectItem key={id} value={id}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function SettingSwitch({
  title,
  checked,
  onChange,
  disabled,
}: {
  title: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="gt-tool-switch">
      <label htmlFor={id}>{title}</label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled}>
        <SwitchThumb />
      </Switch>
    </div>
  )
}
