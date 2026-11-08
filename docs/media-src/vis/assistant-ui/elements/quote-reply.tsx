"use client";

import type { ComponentProps } from "react";
import { PencilLineIcon, QuoteIcon, SparklesIcon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { floating, mono } from "./surfaces";

export interface QuoteAction {
  key: string;
  label: string;
  icon: "quote" | "explain" | "rewrite";
}

const ICON = {
  quote: QuoteIcon,
  explain: SparklesIcon,
  rewrite: PencilLineIcon,
} as const;

export function QuoteReply({
  before,
  selection,
  after,
  actions,
  toolbarVisible,
  quoted,
  onAction,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "before"
  | "selection"
  | "after"
  | "actions"
  | "toolbarVisible"
  | "quoted"
  | "onAction"
> & {
  before: string;
  selection: string;
  after: string;
  actions: readonly QuoteAction[];
  toolbarVisible: boolean;
  quoted?: string;
  onAction?: (key: string) => void;
}) {
  return (
    <div
      data-slot="quote-reply"
      className={cn("flex w-full max-w-sm flex-col gap-2.5", className)}

      {...props}
    >
      <p className="relative text-[13.5px] leading-relaxed">
        <span className="text-foreground/70">{before}</span>
        <span className="text-foreground/95 rounded bg-primary/18 px-0.5 dark:bg-primary/25">
          {selection}
        </span>
        <span className="text-foreground/70">{after}</span>
      </p>

      <div className="flex min-h-11 items-start">
        {toolbarVisible && onAction && (
          <div
            className={cn(
              floating,
              "fade-in zoom-in-95 slide-in-from-top-1 animate-in flex flex-wrap items-center gap-1 rounded-full p-1 duration-200",
            )}
          >
            {actions.map((action) => {
              const Icon = ICON[action.icon];
              return (
                <Button
                  key={action.key}
                  type="button"
                  onClick={() => onAction(action.key)}
                  variant="outline"
                  size="sm"
                >
                  <Icon data-icon="inline-start" />
                  {action.label}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {quoted && (
        <div className="fade-in slide-in-from-bottom-1 animate-in flex flex-col gap-1 duration-300">
          <span className={cn(mono, "text-muted-foreground")}>回复</span>
          <div className="border-foreground/15 text-muted-foreground border-s-2 ps-2.5 text-xs leading-relaxed">
            {quoted}
          </div>
        </div>
      )}
    </div>
  );
}
