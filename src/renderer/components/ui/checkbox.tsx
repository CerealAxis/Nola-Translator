"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { cn } from "@/lib/utils"
import { CheckIcon, MinusIcon } from "lucide-react"

function Checkbox({ className, indeterminate, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      indeterminate={indeterminate}
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-nola-ui-input bg-nola-ui-field-background transition-shadow outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2    disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-nola-ui-destructive aria-invalid:ring-[3px] aria-invalid:ring-nola-ui-destructive/20 dark:bg-nola-ui-input/30 dark:aria-invalid:border-nola-ui-destructive/50 dark:aria-invalid:ring-nola-ui-destructive/40 data-checked:border-nola-ui-primary data-checked:bg-nola-ui-primary data-checked:text-nola-ui-primary-foreground data-indeterminate:border-nola-ui-primary data-indeterminate:bg-nola-ui-primary data-indeterminate:text-nola-ui-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        {indeterminate ? <MinusIcon aria-hidden="true" /> : <CheckIcon aria-hidden="true" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
