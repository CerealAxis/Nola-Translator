import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

export interface InputProps extends React.ComponentProps<typeof InputPrimitive> {}

function Input({ className, type, ...props }: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn("input",
        "h-[var(--field-control-height)] w-full min-w-0 rounded-[var(--field-radius)] border border-nola-ui-input bg-nola-ui-field-background px-4 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-nola-ui-foreground placeholder:text-nola-ui-muted-foreground focus-visible:border-nola-ui-ring focus-visible:ring-3 focus-visible:ring-nola-ui-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-nola-ui-destructive aria-invalid:ring-3 aria-invalid:ring-nola-ui-destructive/20 md:text-sm dark:aria-invalid:border-nola-ui-destructive/50 dark:aria-invalid:ring-nola-ui-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
