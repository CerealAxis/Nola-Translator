import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-nola-ui-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-nola-ui-muted-foreground focus-visible:border-nola-ui-ring focus-visible:ring-3 focus-visible:ring-nola-ui-ring/50 disabled:cursor-not-allowed disabled:bg-nola-ui-input/50 disabled:opacity-50 aria-invalid:border-nola-ui-destructive aria-invalid:ring-3 aria-invalid:ring-nola-ui-destructive/20 md:text-sm dark:bg-nola-ui-input/30 dark:disabled:bg-nola-ui-input/80 dark:aria-invalid:border-nola-ui-destructive/50 dark:aria-invalid:ring-nola-ui-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
