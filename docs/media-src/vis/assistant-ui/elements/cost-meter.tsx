"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";
import { announced, pct } from "../utils/range";
import { formatTokenCount } from "../utils/tokens";

export interface CostLine {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: string;
  share: number;
}

export function CostMeter({
  runCost,
  sessionCost,
  lines,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "runCost" | "sessionCost" | "lines"
> & {
  runCost: string;
  sessionCost: string;
  lines: readonly CostLine[];
}) {
  return (
    <div
      data-slot="cost-meter"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col gap-3 rounded-2xl p-4",
        className,
      )}

      {...props}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-medium tracking-tight tabular-nums">
          {runCost}
        </span>
        <span className={cn(mono, "text-muted-foreground")}>本次运行</span>
        <span
          className={cn(mono, "text-muted-foreground ms-auto tabular-nums")}
        >
          {sessionCost} 会话
        </span>
      </div>

      <div className="bg-foreground/[0.06] inset-ring-border flex h-1.5 w-full overflow-hidden rounded-full inset-ring forced-colors:border">
        {lines.map((line, i) => {
          const width = pct(line.share, 1);
          if (announced(width) === 0) return null;
          return (
            <span
              key={line.model}
              role="meter"
              aria-label={`${line.model} 的费用占比`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={announced(width)}
              className={cn(
                "h-full transition-[width] duration-500 forced-color-adjust-none motion-reduce:transition-none",
                i === 0
                  ? "bg-primary"
                  : i === 1
                    ? "bg-primary/55"
                    : "bg-foreground/25",
              )}
              style={{ width: `${width}%` }}
            />
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        {lines.map((line) => (
          <div
            key={line.model}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
          >
            <span className="text-foreground/75 min-w-0 grow truncate text-[13px]">
              {line.model}
            </span>
            <span className="ms-auto flex min-w-0 items-baseline gap-2">
              <span
                className={cn(
                  mono,
                  "text-muted-foreground truncate tabular-nums",
                )}
              >
                {formatTokenCount(line.inputTokens)} 在·{" "}
                {formatTokenCount(line.outputTokens)} 出
              </span>
              <span
                className={cn(mono, "text-foreground/75 shrink-0 tabular-nums")}
              >
                {line.cost}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
