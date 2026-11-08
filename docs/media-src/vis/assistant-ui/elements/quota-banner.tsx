"use client";

import type { ComponentProps } from "react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";
import { announced, pct } from "../utils/range";

export function QuotaBanner({
  used,
  limit,
  unit,
  resetsIn,
  upgradeLabel,
  onUpgrade,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "used"
  | "limit"
  | "unit"
  | "resetsIn"
  | "upgradeLabel"
  | "onUpgrade"
> & {
  used: number;
  limit: number;
  unit: string;
  resetsIn: string;
  upgradeLabel: string;
  onUpgrade?: () => void;
}) {
  const left = Math.max(0, limit - used);
  const ratio = limit === 0 ? 0 : used / limit;
  const exhausted = limit > 0 && left === 0;
  const tight = !exhausted && ratio >= 0.9;

  return (
    <div
      data-slot="quota-banner"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col gap-2.5 rounded-2xl p-3.5",
        className,
      )}

      {...props}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-[13.5px] font-medium",
            exhausted && "text-destructive",
            tight && "text-chart-4",
          )}
        >
          {left} {unit} 左
        </span>
        <span
          className={cn(mono, "text-muted-foreground ms-auto tabular-nums")}
        >
          复位 {resetsIn}
        </span>
      </div>

      <span
        role="meter"
        aria-label={`已使用的${unit}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={announced(pct(used, limit))}
        aria-valuetext={`${used} of ${limit} ${unit} used`}
        className="bg-foreground/[0.06] inset-ring-border h-1 w-full overflow-hidden rounded-full inset-ring forced-colors:border"
      >
        <span
          className={cn(
            "block h-full rounded-full transition-[width] duration-500 forced-color-adjust-none motion-reduce:transition-none",
            exhausted
              ? "bg-destructive"
              : tight
                ? "bg-chart-4"
                : "bg-foreground/40",
          )}
          style={{ width: `${pct(used, limit)}%` }}
        />
      </span>

      <div className="flex items-center gap-2">
        <span className={cn(mono, "text-muted-foreground tabular-nums")}>
          {used} 的 {limit} 二手
        </span>
        <Button
          type="button"
          onClick={onUpgrade}
          className="ms-auto"
        >
          {upgradeLabel}
        </Button>
      </div>
    </div>
  );
}
