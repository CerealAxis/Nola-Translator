import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { Popover } from '@base-ui/react/popover'
import { Slider } from '@base-ui/react/slider'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from './button'
import { Input } from './input'
import './color-picker.css'

export interface ColorPickerProps {
  label: string
  value: string
  presets: readonly string[]
  onChange: (value: string) => void
}

interface Hsv { h: number; s: number; v: number }

function parseHex(text: string): string | null {
  const digits = text.trim().replace(/^#/, '')
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(digits)) return null
  return `#${digits.length === 3 ? [...digits].map(digit => digit + digit).join('') : digits}`.toUpperCase()
}

function fromHex(hex: string): Hsv {
  const normalized = parseHex(hex) ?? '#000000'
  const [r, g, b] = [1, 3, 5].map(start => parseInt(normalized.slice(start, start + 2), 16) / 255)
  const max = Math.max(r!, g!, b!)
  const min = Math.min(r!, g!, b!)
  const delta = max - min
  const h = delta === 0 ? 0 : max === r ? 60 * (((g! - b!) / delta) % 6) : max === g ? 60 * ((b! - r!) / delta + 2) : 60 * ((r! - g!) / delta + 4)
  return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max * 100, v: max * 100 }
}

function toHex({ h, s, v }: Hsv): string {
  const hue = (h + 360) % 360
  const c = v / 100 * s / 100
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1))
  const m = v / 100 - c
  const channels = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]
  return `#${channels.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/** Retains hue for achromatic colours so moving through black or white does not reset the hue. */
export function ColorPicker({ label, value, presets, onChange }: ColorPickerProps) {
  const [hsv, setHsv] = useState(() => fromHex(value))
  const [draft, setDraft] = useState<string | null>(null)
  const emitted = useRef(value)
  useEffect(() => {
    if (value === emitted.current) return
    emitted.current = value
    setHsv(fromHex(value))
    setDraft(null)
  }, [value])
  const change = (next: Hsv) => {
    setHsv(next)
    const hex = toHex(next)
    emitted.current = hex
    setDraft(null)
    onChange(hex)
  }
  const commitHex = (hex: string) => {
    const next = fromHex(hex)
    change({ ...next, h: next.s === 0 ? hsv.h : next.h })
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width === 0 || bounds.height === 0) return
    change({ ...hsv, s: Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)), v: Math.max(0, Math.min(100, (1 - (event.clientY - bounds.top) / bounds.height) * 100)) })
  }
  return <Popover.Root>
    <Popover.Trigger render={<Button variant="secondary" />} className="nola-color-picker__trigger" aria-label={label}>
      <span className="nola-color-picker__swatch" style={{ backgroundColor: value }} aria-hidden="true" /><ChevronDown aria-hidden="true" />
    </Popover.Trigger>
    <Popover.Portal><Popover.Positioner className="z-dropdown" sideOffset={8}><Popover.Popup className="nola-color-picker" aria-label={label} initialFocus={false}>
      <Popover.Title className="sr-only">{label}</Popover.Title>
      <div className="nola-color-picker__area" role="group" aria-label={label}
        style={{ '--picker-hue': `hsl(${hsv.h} 100% 50%)` } as CSSProperties}
        onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); move(event) }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event) }}
        onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}>
        <span className="nola-color-picker__cursor" aria-hidden="true" style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, backgroundColor: toHex(hsv) }} />
        {/* Independent slider controls expose both axes to keyboards and assistive technology. */}
        {(['s', 'v'] as const).map(axis => <Slider.Root key={axis} className="sr-only" value={hsv[axis]} min={0} max={100} step={1} onValueChange={next => change({ ...hsv, [axis]: next })}>
          <Slider.Control><Slider.Track><Slider.Thumb aria-label={`${label} · ${axis.toUpperCase()}`} aria-valuetext={`${Math.round(hsv[axis])}%`} /></Slider.Track></Slider.Control>
        </Slider.Root>)}
      </div>
      <Slider.Root className="nola-color-picker__hue" value={hsv.h} min={0} max={360} step={1} onValueChange={h => change({ ...hsv, h })}>
        <Slider.Control className="nola-color-picker__hue-control"><Slider.Track className="nola-color-picker__hue-track"><Slider.Thumb className="nola-color-picker__hue-thumb" aria-label={`${label} · H`} aria-valuetext={`${Math.round(hsv.h)}°`} /></Slider.Track></Slider.Control>
      </Slider.Root>
      <div className="nola-color-picker__presets" role="group" aria-label={label}>{presets.map(color => <Button key={color} variant="secondary" size="icon" className="nola-color-picker__preset" aria-label={`${label} ${color}`} aria-pressed={value.toUpperCase() === color.toUpperCase()} style={{ backgroundColor: color }} onClick={() => commitHex(color)}>{value.toUpperCase() === color.toUpperCase() ? <Check aria-hidden="true" style={{ color: fromHex(color).v > 60 ? '#000000' : '#FFFFFF' }} /> : null}</Button>)}</div>
      <Input value={draft ?? value} aria-label={`${label} · HEX`} aria-invalid={draft !== null && parseHex(draft) === null} spellCheck={false} onValueChange={text => {
        setDraft(text)
        const parsed = parseHex(text)
        if (parsed) { commitHex(parsed); setDraft(text) }
      }} onBlur={() => setDraft(null)} />
    </Popover.Popup></Popover.Positioner></Popover.Portal>
  </Popover.Root>
}
