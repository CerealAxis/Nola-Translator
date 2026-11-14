import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from './input'

const Combobox = ComboboxPrimitive.Root

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return <ComboboxPrimitive.Trigger data-slot="combobox-trigger" className={cn('select__trigger', className)} {...props}>
    {children}<ChevronDown aria-hidden="true" />
  </ComboboxPrimitive.Trigger>
}

function ComboboxInput(props: ComboboxPrimitive.Input.Props) {
  return <ComboboxPrimitive.Input render={<Input />} {...props} />
}

function ComboboxContent({ container, className, sideOffset = 4, align = 'start', children, ...props }: ComboboxPrimitive.Popup.Props & Pick<ComboboxPrimitive.Positioner.Props, 'sideOffset' | 'align'> & { container?: HTMLElement | null }) {
  return <ComboboxPrimitive.Portal container={container}><ComboboxPrimitive.Positioner sideOffset={sideOffset} align={align} className="isolate z-popup">
    <ComboboxPrimitive.Popup data-slot="combobox-content" className={cn('select__popover', className)} {...props}>{children}</ComboboxPrimitive.Popup>
  </ComboboxPrimitive.Positioner></ComboboxPrimitive.Portal>
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return <ComboboxPrimitive.List data-slot="combobox-list" className={cn('combobox__list', className)} {...props} />
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return <ComboboxPrimitive.Item data-slot="combobox-item" className={cn('select__item', className)} {...props}>
    <span className="select__item-text">{children}</span><ComboboxPrimitive.ItemIndicator className="select__item-indicator"><Check aria-hidden="true" /></ComboboxPrimitive.ItemIndicator>
  </ComboboxPrimitive.Item>
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return <ComboboxPrimitive.Empty data-slot="combobox-empty" className={cn('text-sm text-muted-foreground', className)} {...props} />
}

export { Combobox, ComboboxTrigger, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty }
