"use client";

import type { ComponentProps } from "react";
import type { ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";
import { useReceiptFocus } from "./receipt-focus";

export type RecommendationState = "idle" | "accepted";

const CONFIDENCE_BARS = [0, 1, 2];

export function RecommendationCard({
  state,
  question,
  children,
  confidenceLabel,
  acceptedLabel,
  onAccept,
  onAlternatives,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "state"
  | "question"
  | "children"
  | "confidenceLabel"
  | "acceptedLabel"
  | "onAccept"
  | "onAlternatives"
> & {
  state: RecommendationState;
  question: string;
  children: ReactNode;
  confidenceLabel: string;
  acceptedLabel: string;
  onAccept?: () => void;
  onAlternatives?: () => void;
}) {
  const { receiptRef, focusHandlers } = useReceiptFocus<HTMLDivElement>(props);
  return (
    <div
      data-slot="recommendation-card"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col gap-3 p-4",
        className,
      )}

      {...props}
      {...focusHandlers}
    >
      <p className="text-sm font-medium">{question}</p>
      <p className="text-muted-foreground text-[13px] leading-relaxed">
        {children}
      </p>

      <div className="flex h-8 items-center justify-between">
        {state === "idle" ? (
          <>
            <div className="flex items-center gap-2">
              <span className="flex items-end gap-0.5" aria-hidden>
                {CONFIDENCE_BARS.map((bar) => (
                  <span
                    key={bar}
                    className="w-1 rounded-full bg-chart-2/70"
                    style={{ height: 6 + bar * 3 }}
                  />
                ))}
              </span>
              <span className={cn(mono, "text-muted-foreground")}>
                {confidenceLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={onAlternatives}
                variant="outline"
              >
                备选方案
              </Button>
              <Button
                type="button"
                onClick={onAccept}
              >
                接受
              </Button>
            </div>
          </>
        ) : (
          <div
            key="accepted"
            ref={receiptRef}
            tabIndex={-1}
            className="fade-in animate-in text-muted-foreground flex items-center gap-2 text-xs duration-300"
          >
            <CheckIcon className="size-3.5 text-chart-2" />
            {acceptedLabel}
          </div>
        )}
      </div>
    </div>
  );
}
