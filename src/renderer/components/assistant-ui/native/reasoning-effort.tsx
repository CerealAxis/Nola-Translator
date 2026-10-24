"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { field } from "./surfaces";
import { SliderControl, SliderIndicator, SliderRoot, SliderThumb, SliderTrack } from "@/components/ui/slider";

export interface EffortLevel {
  key: string;
  label: string;
}

export function ReasoningEffort({
  levels,
  selectedKey,
  title,
  onSelect,
  variant = "segments",
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "levels" | "selectedKey" | "onSelect" | "variant" | "title"
> & {
  levels: readonly EffortLevel[];
  selectedKey: string;
  onSelect?: (key: string) => void;
  variant?: "segments" | "slider";
  title: string;
}) {
  const selectedIndex = Math.max(0, levels.findIndex((level) => level.key === selectedKey));

  return (
    <div
      data-slot="reasoning-effort"
      className={cn("flex w-full max-w-sm flex-col gap-2.5", className)}

      {...props}
    >
      {variant === "slider" ? <div className="px-1">
        <SliderRoot min={0} max={Math.max(0, levels.length - 1)} step={1} value={selectedIndex} onValueChange={value => {
          if (typeof value === "number" && Number.isInteger(value)) onSelect?.(levels[value]?.key ?? selectedKey);
        }}>
          <SliderControl className="relative flex w-full touch-none items-center py-2 select-none">
            <SliderTrack className="relative h-1 w-full rounded-full bg-foreground/[0.1]">
              <SliderIndicator className="rounded-full bg-primary" />
              <SliderThumb aria-label={title} className="relative size-5 rounded-full border-2 border-primary bg-background shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
            </SliderTrack>
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-1 top-1/2 flex -translate-y-1/2 items-center justify-between">
              {levels.map((level, index) => <span key={level.key} className={cn("size-1.5 rounded-full", index <= selectedIndex ? "bg-primary-foreground/40" : "bg-foreground/20")} />)}
            </div>
          </SliderControl>
        </SliderRoot>
        <div className="mt-2 grid" style={{ gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))` }}>
          {levels.map(level => <span key={level.key} className="text-center text-[11px] text-muted-foreground">{level.label}</span>)}
        </div>
      </div> : <div className={cn(field, "flex gap-0.5 rounded-full p-0.5")}>
        {levels.map((level) => {
          const active = level.key === selectedKey;
          const className = cn(
            "flex-1 rounded-full py-1 text-xs font-medium transition-[background-color,color,scale] duration-150",
            onSelect && "active:scale-[0.97]",
            active
              ? "bg-background text-foreground/90"
              : onSelect
                ? "text-muted-foreground hover:text-foreground/70"
                : "text-muted-foreground",
          );
          return onSelect ? (
            <button
              key={level.key}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(level.key)}
              className={className}
            >
              {level.label}
            </button>
          ) : (
            <span
              key={level.key}
              aria-current={active ? "true" : undefined}
              className={className}
            >
              {level.label}
            </span>
          );
        })}
      </div>}

    </div>
  );
}
