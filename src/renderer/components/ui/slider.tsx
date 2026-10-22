import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { cn } from '@/lib/utils'
import type { ComponentProps, RefAttributes } from 'react'

export interface SliderRootProps<Value extends number | readonly number[] = number | readonly number[]> extends SliderPrimitive.Root.Props<Value>, RefAttributes<HTMLDivElement> {}
export interface SliderControlProps extends ComponentProps<typeof SliderPrimitive.Control> {}
export interface SliderTrackProps extends ComponentProps<typeof SliderPrimitive.Track> {}
export interface SliderIndicatorProps extends ComponentProps<typeof SliderPrimitive.Indicator> {}
export interface SliderThumbProps extends ComponentProps<typeof SliderPrimitive.Thumb> {}

function SliderRoot<Value extends number | readonly number[]>({ className, ...props }: SliderRootProps<Value>) {
  return <SliderPrimitive.Root data-slot="slider" className={cn('slider min-w-0', className)} {...props} />
}
function SliderControl({ className, ...props }: SliderPrimitive.Control.Props) {
  return <SliderPrimitive.Control className={cn('flex w-full touch-none items-center py-2 select-none', className)} {...props} />
}
function SliderTrack({ className, ...props }: SliderPrimitive.Track.Props) {
  return <SliderPrimitive.Track className={cn('slider__track', className)} {...props} />
}
function SliderIndicator({ className, ...props }: SliderPrimitive.Indicator.Props) {
  return <SliderPrimitive.Indicator className={cn('slider__fill', className)} {...props} />
}
function SliderThumb({ className, ...props }: SliderPrimitive.Thumb.Props) {
  return <SliderPrimitive.Thumb className={cn('slider__thumb', className)} {...props} />
}

export { SliderRoot, SliderControl, SliderTrack, SliderIndicator, SliderThumb }
