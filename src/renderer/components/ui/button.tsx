import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { TooltipHint } from "./tooltip"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[var(--radius-xl)] border border-transparent bg-clip-padding type-body font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform,translate] outline-none select-none    active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-nola-ui-destructive aria-invalid:ring-3 aria-invalid:ring-nola-ui-destructive/20 dark:aria-invalid:border-nola-ui-destructive/50 dark:aria-invalid:ring-nola-ui-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-nola-ui-primary text-nola-ui-primary-foreground hover:bg-[var(--primary-hover)]",
        secondary:
          "border-nola-ui-border bg-nola-ui-background text-nola-ui-foreground hover:bg-nola-ui-muted hover:text-nola-ui-foreground aria-expanded:bg-nola-ui-muted aria-expanded:text-nola-ui-foreground dark:border-nola-ui-input dark:bg-nola-ui-input/30 dark:hover:bg-nola-ui-input/50",
        bare: "bg-transparent text-nola-ui-muted-foreground hover:text-nola-ui-foreground",
        nav:
          "border-0 bg-transparent text-nola-ui-foreground data-[active=false]:hover:bg-surface-tertiary aria-expanded:bg-surface-tertiary data-[active=true]:bg-[image:var(--nola-primary-gradient)] data-[active=true]:text-nola-ui-primary-foreground data-[active=true]:shadow-[0_3px_12px_color-mix(in_oklch,var(--accent)_17%,transparent)]",
        danger:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-nola-ui-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-[var(--field-control-height)] gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-[var(--radius-xl)] px-2 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-[var(--radius-xl)] px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-6 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-10",
        "icon-xs": "size-6 rounded-[var(--radius-xl)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-[var(--radius-xl)]",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>
export interface ButtonProps extends Omit<ButtonPrimitive.Props, "className" | "title"> {
  className?: string
  variant?: ButtonVariant
  size?: ButtonSize
  tooltip?: string
}

function Button({
  className,
  variant = "default",
  size = "default",
  tooltip,
  ...props
}: ButtonProps) {
  const button = (
    <ButtonPrimitive
      data-slot="button"
      data-size={size}
      data-variant={variant}
      className={cn("button", buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
  return tooltip ? <TooltipHint content={tooltip} disabledTrigger={props.disabled && !props.focusableWhenDisabled}>{button}</TooltipHint> : button
}

export { Button, buttonVariants }
