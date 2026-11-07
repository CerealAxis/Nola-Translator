"use client";

import type { ComponentProps } from "react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";
import { indexIn } from "../utils/range";

export interface OnboardingStep {
  title: string;
  body: string;
  example: string;
}

export function Onboarding({
  steps,
  index,
  onNext,
  onSkip,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "steps" | "index" | "onNext" | "onSkip"
> & {
  steps: readonly OnboardingStep[];
  index: number;
  onNext?: () => void;
  onSkip?: () => void;
}) {
  const current = indexIn(steps, index);
  const step = steps[current];
  if (!step) return null;
  const last = current >= steps.length - 1;

  return (
    <div
      data-slot="onboarding"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col gap-4 p-5",
        className,
      )}

      {...props}
    >
      <div
        key={current}
        className="fade-in animate-in flex flex-col gap-2 duration-300"
      >
        <span className={cn(mono, "text-muted-foreground tabular-nums")}>
          {current + 1} 的 {steps.length}
        </span>
        <span className="text-[15px] font-medium tracking-tight">
          {step.title}
        </span>
        <p className="text-muted-foreground text-[13px] leading-relaxed break-words">
          {step.body}
        </p>
        <span
          className={cn(
            field,
            "text-foreground/60 rounded-xl px-3 py-2 text-[13px] leading-relaxed",
          )}
        >
          {step.example}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="flex gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "h-1 rounded-full transition-all duration-300 motion-reduce:transition-none",
                i === current ? "bg-foreground/60 w-4" : "bg-foreground/15 w-1",
              )}
            />
          ))}
        </span>

        <Button
          type="button"
          onClick={onSkip}
          variant="outline"
          className="ms-auto"
        >
          跳过
        </Button>
        <Button
          type="button"
          onClick={onNext}
        >
          {last ? "启动" : "下一页"}
        </Button>
      </div>
    </div>
  );
}
