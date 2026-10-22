import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Button } from '../../../src/renderer/components/ui/button'

export interface ChoiceOption { value: string; label: string; disabled?: boolean }
export interface ChoiceFieldProps { label: string; value: string; options: ChoiceOption[]; disabled?: boolean; onChange: (value: string) => void }
export function ChoiceField({ label, value, options, disabled, onChange }: ChoiceFieldProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const id = useId()
  const optionId = (index: number): string => `${id}-option-${index}`
  const selected = options.find(option => option.value === value)
  const select = (option: ChoiceOption): void => {
    if (option.disabled) return
    onChange(option.value)
    setOpen(false)
  }
  /** Moves the active option by `step`, skipping the disabled ones. */
  const move = (from: number, step: number): number => {
    for (let next = from + step; next >= 0 && next < options.length; next += step) if (!options[next].disabled) return next
    return from
  }
  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(current => move(current, 1)); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(current => move(current, -1)); return }
    if (event.key === 'Home') { event.preventDefault(); setActive(current => move(-1, 1)); return }
    if (event.key === 'End') { event.preventDefault(); setActive(current => move(options.length, -1)); return }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const option = options[active]
      if (option) select(option)
    }
  }
  return <div className="nola-choice">
    <div className="nola-row"><span id={`${id}-label`}>{label}</span><Button data-slot="button" variant="secondary" className="button button--sm button--secondary" disabled={disabled} aria-labelledby={`${id}-label`} aria-expanded={open && !disabled} aria-controls={id} onClick={() => { if (disabled) return; setActive(Math.max(0, options.findIndex(option => option.value === value))); setOpen(current => !current) }}>{selected?.label ?? label}</Button></div>
    {open && !disabled && <div id={id} role="listbox" aria-label={label} aria-activedescendant={active < options.length ? optionId(active) : undefined} tabIndex={0} className="nola-options list-box" onKeyDown={onListKeyDown}>
      {options.map((option, index) => {
        const isSelected = option.value === value
        return <div key={option.value} id={optionId(index)} role="option" aria-selected={isSelected} aria-disabled={option.disabled || undefined} data-selected={isSelected || undefined} data-disabled={option.disabled || undefined} className="list-box-item" onClick={() => select(option)}>
          {option.label}
          <span aria-hidden="true" className="list-box-item__indicator">
            <svg data-slot="list-box-item-indicator--checkmark" fill="none" role="presentation" stroke="currentColor" strokeDasharray={22} strokeDashoffset={isSelected ? 44 : 66} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 17 18"><polyline points="1 9 7 14 15 4" /></svg>
          </span>
        </div>
      })}
    </div>}
  </div>
}
