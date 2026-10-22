import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group'
import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import type { ComponentProps, RefAttributes } from 'react'

export interface ToggleGroupProps<Value extends string = string> extends ToggleGroupPrimitive.Props<Value>, RefAttributes<HTMLDivElement> {}
export interface ToggleGroupItemProps extends ComponentProps<typeof TogglePrimitive> {}
import { cn } from '@/lib/utils'

function ToggleGroup<Value extends string>({ className, ...props }: ToggleGroupProps<Value>) {
  return <ToggleGroupPrimitive data-slot="toggle-group" className={cn('nola-segmented', className)} {...props} />
}
function ToggleGroupItem({ className, ...props }: ComponentProps<typeof TogglePrimitive>) {
  return <TogglePrimitive data-slot="toggle-group-item" className={cn('toggle-button', className)} {...props} />
}

export { ToggleGroup, ToggleGroupItem }
