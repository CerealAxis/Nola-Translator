import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'

export interface SwitchProps extends ComponentProps<typeof SwitchPrimitive.Root> {}
export interface SwitchThumbProps extends ComponentProps<typeof SwitchPrimitive.Thumb> {}

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return <SwitchPrimitive.Root data-slot="switch" className={cn('switch', className)} {...props} />
}
function SwitchThumb({ className, ...props }: SwitchPrimitive.Thumb.Props) {
  return <SwitchPrimitive.Thumb className={cn('switch__thumb', className)} {...props} />
}

export { Switch, SwitchThumb }
