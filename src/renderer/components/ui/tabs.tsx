import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'

export interface TabsRootProps extends ComponentProps<typeof TabsPrimitive.Root> {}
export interface TabsListProps extends ComponentProps<typeof TabsPrimitive.List> {}
export interface TabsTriggerProps extends ComponentProps<typeof TabsPrimitive.Tab> {}
export interface TabsContentProps extends ComponentProps<typeof TabsPrimitive.Panel> {}
export interface TabsIndicatorProps extends ComponentProps<typeof TabsPrimitive.Indicator> {}

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('min-w-0', className)} {...props} />
}
function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return <TabsPrimitive.List data-slot="tabs-list" className={cn('tabs__list', className)} {...props} />
}
function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return <TabsPrimitive.Tab data-slot="tabs-trigger" className={cn('tabs__tab', className)} {...props} />
}
function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn('tabs__panel', className)} {...props} />
}
function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return <TabsPrimitive.Indicator data-slot="tabs-indicator" className={cn('tabs__indicator', className)} {...props} />
}

export { Tabs, Tabs as TabsRoot, TabsList, TabsTrigger, TabsContent, TabsIndicator }
