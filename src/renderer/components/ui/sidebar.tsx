import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { usePanelRef } from 'react-resizable-panels'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { PanelLeft } from 'lucide-react'
import { Button } from './button'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'
import { ResizablePanel, ResizablePanelGroup } from './resizable'

const SIDEBAR_WIDTH = { default: 250, min: 208, max: 320, icon: 56, collapseDistance: 32 } as const

const SidebarContext = createContext<{
  open: boolean
  toggleSidebar: () => void
  sidebarId: string
  panelRef: { current: PanelImperativeHandle | null }
  initialWidth: number
  onResize: (width: number) => void
} | null>(null)

function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) throw new Error('useSidebar must be used within a SidebarProvider.')
  return context
}

// Keep the shadcn icon-collapse layout in flow so it fits inside the desktop shell.
function SidebarProvider({ defaultOpen, storageKey, ...props }: ComponentProps<typeof ResizablePanelGroup> & { defaultOpen: boolean; storageKey?: string }) {
  const [initialWidth] = useState(() => {
    try {
      const saved = storageKey ? Number(localStorage.getItem(storageKey)) : NaN
      if (Number.isFinite(saved) && saved >= SIDEBAR_WIDTH.min && saved <= SIDEBAR_WIDTH.max) return saved
    } catch { /* Storage is optional for the desktop navigation. */ }
    return SIDEBAR_WIDTH.default
  })
  const expandedWidth = useRef(initialWidth)
  const groupElement = useRef<HTMLDivElement>(null)
  const compact = useRef(!defaultOpen)
  const resizeFrame = useRef(0)
  compact.current = !defaultOpen
  const panelRef = usePanelRef()
  const [open, setOpen] = useState(defaultOpen)
  const sidebarId = useId()
  useEffect(() => {
    let previousWidth = 0
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === previousWidth) return
      previousWidth = entry.contentRect.width
      cancelAnimationFrame(resizeFrame.current)
      // Run after the library remeasures a window/zoom resize; dragging a divider does not resize this group.
      resizeFrame.current = requestAnimationFrame(() => {
        if (compact.current) panelRef.current?.collapse()
      })
    })
    if (groupElement.current) observer.observe(groupElement.current)
    return () => { observer.disconnect(); cancelAnimationFrame(resizeFrame.current) }
  }, [panelRef])
  return (
    <SidebarContext.Provider value={{ open, sidebarId, panelRef, initialWidth: defaultOpen ? initialWidth : SIDEBAR_WIDTH.icon,
      toggleSidebar: () => {
        if (open) panelRef.current?.collapse()
        else panelRef.current?.resize(expandedWidth.current)
      },
      onResize: width => {
        if (width <= 0) return
        setOpen(width > SIDEBAR_WIDTH.icon + 1)
        if (width >= SIDEBAR_WIDTH.min) {
          expandedWidth.current = Math.min(SIDEBAR_WIDTH.max, width)
          try { if (storageKey) localStorage.setItem(storageKey, String(expandedWidth.current)) } catch { /* Keep resizing available without storage. */ }
        }
      },
    }}>
      <ResizablePanelGroup {...props} data-slot="sidebar-wrapper" orientation="horizontal" elementRef={groupElement}
        onPointerDownCapture={() => cancelAnimationFrame(resizeFrame.current)}
        onKeyDownCapture={() => cancelAnimationFrame(resizeFrame.current)} />
    </SidebarContext.Provider>
  )
}

function Sidebar({ variant = 'sidebar', ...props }: ComponentProps<'aside'> & { variant?: 'sidebar' | 'inset' }) {
  const { open, sidebarId, panelRef, initialWidth, onResize } = useSidebar()
  return <ResizablePanel id={`${sidebarId}-panel`} data-slot="sidebar-panel" className="nola-sidebar-panel"
    defaultSize={initialWidth} minSize={SIDEBAR_WIDTH.min} maxSize={SIDEBAR_WIDTH.max}
    collapsedSize={SIDEBAR_WIDTH.icon} collapsedThreshold={SIDEBAR_WIDTH.collapseDistance}
    collapsible groupResizeBehavior="preserve-pixel-size" panelRef={panelRef}
    onResize={size => onResize(size.inPixels)} style={{ overflow: 'hidden' }}>
    <aside {...props} id={sidebarId} data-slot="sidebar" data-variant={variant} data-state={open ? 'expanded' : 'collapsed'} data-collapsible={open ? undefined : 'icon'} />
  </ResizablePanel>
}

function SidebarInset(props: ComponentProps<'div'>) {
  return <ResizablePanel data-slot="sidebar-inset" minSize={320} style={{ overflow: 'hidden' }} {...props} />
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

function SidebarGroup(props: ComponentProps<'div'>) {
  return <div data-slot="sidebar-group" {...props} />
}

function SidebarGroupLabel(props: ComponentProps<'div'>) {
  return <div data-slot="sidebar-group-label" {...props} />
}

function SidebarGroupContent(props: ComponentProps<'div'>) {
  return <div data-slot="sidebar-group-content" {...props} />
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
  const button = useRender({
    defaultTagName: 'button',
    props: mergeProps<'button'>({ type: 'button' }, props),
    render: <TooltipTrigger delay={400} render={render} />,
    state: { slot: 'sidebar-menu-button', active: String(isActive) },
  })

  return (
    <Tooltip>
      {button}
      <TooltipContent side="right" sideOffset={8}>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

export {
  Sidebar, SidebarInset, SidebarProvider, SidebarTrigger, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
}
