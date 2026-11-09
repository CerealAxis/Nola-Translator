"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { mono, ShimmerLabel } from "./surfaces";

export function ThinkingIndicator({
  label,
  elapsed,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "label" | "elapsed"> & {
  label: string;
  elapsed?: string;
}) {
  return (
    <div
      data-slot="thinking-indicator"
      className={cn(
        "text-muted-foreground flex items-center gap-2.5 text-sm",
        className,
      )}

      {...props}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
      />
      <ShimmerLabel
        key={label}
        className="fade-in slide-in-from-bottom-1 animate-in relative inline-block min-w-0 truncate leading-tight duration-300"
      >
        {label}
      </ShimmerLabel>
      {elapsed !== undefined && (
        <span
          className={cn(mono, "text-muted-foreground shrink-0 tabular-nums")}
        >
          {elapsed}
        </span>
      )}
    </div>
  );
}
