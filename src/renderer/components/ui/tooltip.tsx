import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { cloneElement, useCallback, useId, useState, type HTMLAttributes, type ReactElement, type ReactNode } from "react"
import { cn } from "@/lib/utils"

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  container,
  anchor,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props & Pick<TooltipPrimitive.Portal.Props, "container"> &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "anchor" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal container={container}>
      <TooltipPrimitive.Positioner
        anchor={anchor}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-popup"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          role="tooltip"
          className={cn(
            "z-popup inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-nola-ui-xl bg-overlay px-3 py-1.5 type-body text-overlay-foreground shadow-overlay has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-popup **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow data-slot="tooltip-arrow" className="z-popup size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-nola-ui-sm bg-overlay fill-overlay data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

function TooltipHint({ children, content, disabledTrigger }: {
  children: ReactElement<{ "aria-describedby"?: string }>
  content: ReactNode
  disabledTrigger?: boolean
}) {
  const [container, setContainer] = useState<ShadowRoot | null>(null)
  const [open, setOpen] = useState(false)
  const id = useId()
  const setTrigger = useCallback((node: HTMLElement | null) => {
    const root = node?.getRootNode()
    setContainer(root instanceof ShadowRoot ? root : null)
  }, [])
  const description = [children.props["aria-describedby"], open ? id : undefined].filter(Boolean).join(" ") || undefined

  return (
    <Tooltip disabled={!content} onOpenChange={setOpen}>
      <TooltipTrigger
        ref={setTrigger}
        render={disabledTrigger
          ? <span className="inline-flex max-w-full" aria-describedby={open ? id : undefined}>{children}</span>
          : cloneElement(children, { "aria-describedby": description })}
      />
      {content && <TooltipContent id={id} container={container ?? undefined} className="wrap-anywhere">{content}</TooltipContent>}
    </Tooltip>
  )
}

function useTooltipAnchor() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = useCallback(() => setAnchor(null), [])

  function findAnchor(target: EventTarget | null, container: HTMLElement) {
    const node = target instanceof Element ? target.closest<HTMLElement>("[data-tooltip-text]") : null
    return node && container.contains(node) && node.dataset.tooltipText ? node : null
  }

  const handlers: HTMLAttributes<HTMLElement> = {
    onPointerOver: event => {
      if (event.pointerType !== "touch") setAnchor(findAnchor(event.target, event.currentTarget))
    },
    onPointerOut: event => setAnchor(findAnchor(event.relatedTarget, event.currentTarget)),
    onFocus: event => setAnchor(findAnchor(event.target, event.currentTarget)),
    onBlur: event => setAnchor(findAnchor(event.relatedTarget, event.currentTarget)),
    onKeyDown: event => { if (event.key === "Escape") close() },
  }

  return { anchor, close, handlers }
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TooltipHint, useTooltipAnchor }

