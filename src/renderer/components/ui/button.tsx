import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-nola-ui-ring focus-visible:ring-3 focus-visible:ring-nola-ui-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-nola-ui-destructive aria-invalid:ring-3 aria-invalid:ring-nola-ui-destructive/20 dark:aria-invalid:border-nola-ui-destructive/50 dark:aria-invalid:ring-nola-ui-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-nola-ui-primary text-nola-ui-primary-foreground hover:bg-nola-ui-primary/80",
        outline:
          "border-nola-ui-border bg-nola-ui-background hover:bg-nola-ui-muted hover:text-nola-ui-foreground aria-expanded:bg-nola-ui-muted aria-expanded:text-nola-ui-foreground dark:border-nola-ui-input dark:bg-nola-ui-input/30 dark:hover:bg-nola-ui-input/50",
        secondary:
          "bg-nola-ui-secondary text-nola-ui-secondary-foreground hover:bg-[color-mix(in_oklch,var(--nola-ui-secondary),var(--nola-ui-foreground)_5%)] aria-expanded:bg-nola-ui-secondary aria-expanded:text-nola-ui-secondary-foreground",
        destructive:
          "bg-nola-ui-destructive/10 text-nola-ui-destructive hover:bg-nola-ui-destructive/20 focus-visible:border-nola-ui-destructive/40 focus-visible:ring-nola-ui-destructive/20 dark:bg-nola-ui-destructive/20 dark:hover:bg-nola-ui-destructive/30 dark:focus-visible:ring-nola-ui-destructive/40",
        link: "text-nola-ui-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-[var(--field-control-height)] gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-[var(--radius-xl)] px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-[var(--radius-xl)] px-3 text-[0.8rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
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

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]> | "danger" | "tertiary"
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>
export interface ButtonProps extends Omit<ButtonPrimitive.Props, "className"> { className?: string; variant?: ButtonVariant; size?: ButtonSize }

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant === "danger" ? "destructive" : variant === "tertiary" ? "outline" : variant}
      className={cn("button", buttonVariants({ variant: variant === "danger" ? "destructive" : variant === "tertiary" ? "outline" : variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
