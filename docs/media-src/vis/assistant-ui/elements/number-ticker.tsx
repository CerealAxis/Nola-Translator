"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { mono } from "./surfaces";

function RollingDigit({ digit }: { digit: number }) {
  return (
    <span className="inline-flex h-[1lh] overflow-hidden">
      <span
        className="flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
        style={{ transform: `translateY(-${digit}lh)` }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="h-[1lh]">
            {i}
          </span>
        ))}
      </span>
    </span>
  );
}

export function NumberTicker({
  value,
  label,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "value" | "label"> & {
  value: number;
  label: string;
}) {
  const formatted = value.toLocaleString("en-US");

  return (
    <div
      data-slot="number-ticker"
      className={cn("flex flex-col items-center gap-2.5", className)}

      {...props}
    >
      <span
        className="flex type-body font-semibold tabular-nums"
        aria-label={formatted}
      >
        {formatted.split("").map((char, i) =>
          /\d/.test(char) ? (
            <RollingDigit key={i} digit={Number(char)} />
          ) : (
            <span key={i} className="h-[1lh]">
              {char}
            </span>
          ),
        )}
      </span>
      <span className={cn(mono, "text-muted-foreground")}>{label}</span>
    </div>
  );
}
