import { createContext, useContext, useId, useState } from 'react'
import type { ComponentProps } from 'react'
import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { PanelLeft } from 'lucide-react'
import { Button } from './button'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

const SidebarContext = createContext<{
  open: boolean
  toggleSidebar: () => void
  sidebarId: string
} | null>(null)

function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) throw new Error('useSidebar must be used within a SidebarProvider.')
  return context
}

// Keep the shadcn icon-collapse layout in flow so it fits inside the desktop shell.
function SidebarProvider({ defaultOpen, ...props }: ComponentProps<'div'> & { defaultOpen: boolean }) {
  const [openOverride, setOpen] = useState<boolean>()
  const open = openOverride ?? defaultOpen
  const sidebarId = useId()
  return (
    <SidebarContext.Provider value={{ open, sidebarId, toggleSidebar: () => setOpen(!open) }}>
      <div data-slot="sidebar-wrapper" {...props} />
    </SidebarContext.Provider>
  )
}

function Sidebar(props: ComponentProps<'aside'>) {
  const { open, sidebarId } = useSidebar()
  return <aside {...props} id={sidebarId} data-slot="sidebar" data-state={open ? 'expanded' : 'collapsed'} data-collapsible={open ? undefined : 'icon'} />
}

function SidebarTrigger({ expandLabel, collapseLabel, ...props }: Omit<ComponentProps<typeof Button>, 'children'> & {
  expandLabel: string
  collapseLabel: string
}) {
  const { open, toggleSidebar, sidebarId } = useSidebar()
  const label = open ? collapseLabel : expandLabel
  return (
    <Button
      {...props}
      data-slot="sidebar-trigger"
      variant="bare"
      size="icon-sm"
      aria-controls={sidebarId}
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={toggleSidebar}
    >
      <PanelLeft aria-hidden="true" />
    </Button>
  )
}

function SidebarHeader(props: ComponentProps<'div'>) {
  return <div data-slot="sidebar-header" {...props} />
}

function SidebarContent(props: ComponentProps<'nav'>) {
  return <nav data-slot="sidebar-content" {...props} />
}

function SidebarFooter(props: ComponentProps<'div'>) {
  return <div data-slot="sidebar-footer" {...props} />
}

function SidebarMenu(props: ComponentProps<'ul'>) {
  return <ul data-slot="sidebar-menu" {...props} />
}

function SidebarMenuItem(props: ComponentProps<'li'>) {
  return <li data-slot="sidebar-menu-item" {...props} />
}

function SidebarMenuButton({ render, isActive = false, tooltip, ...props }: useRender.ComponentProps<'button'> & {
  isActive?: boolean
  tooltip: string
}) {
  const { open } = useSidebar()
  const button = useRender({
    defaultTagName: 'button',
    props: mergeProps<'button'>({ type: 'button' }, props),
    render: <TooltipTrigger delay={400} render={render} />,
    state: { slot: 'sidebar-menu-button', active: String(isActive) },
  })

  return (
    <Tooltip disabled={open}>
      {button}
      <TooltipContent side="right" sideOffset={8}>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

export { Sidebar, SidebarProvider, SidebarTrigger, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton }
