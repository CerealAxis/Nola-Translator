"use client";

import type { ComponentProps } from "react";
import { AlertCircleIcon, Loader2Icon, RotateCwIcon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";

export function ToolError({
  name,
  target,
  message,
  attempt,
  maxAttempts,
  retrying,
  onRetry,
  onSkip,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "name"
  | "target"
  | "message"
  | "attempt"
  | "maxAttempts"
  | "retrying"
  | "onRetry"
  | "onSkip"
> & {
  name: string;
  target: string;
  message: string;
  attempt: number;
  maxAttempts: number;
  retrying: boolean;
  onRetry?: () => void;
  onSkip?: () => void;
}) {
  return (
    <div
      data-slot="tool-error"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col gap-3 rounded-2xl p-3.5",
        className,
      )}

      {...props}
    >
      <div className="flex items-center gap-2.5">
        <AlertCircleIcon className="size-3.5 shrink-0 text-destructive" />
        <span
          className={cn(mono, "text-muted-foreground min-w-0 wrap-anywhere")}
        >
          {name}
        </span>
        <span className="text-foreground/80 min-w-0 flex-1 truncate text-[13px]">
          {target}
        </span>
        <span
          className={cn(mono, "text-muted-foreground shrink-0 tabular-nums")}
        >
          {attempt}/{maxAttempts}
        </span>
      </div>

      <div
        className={cn(
          field,
          "rounded-xl px-3 py-2 font-mono text-[11px] leading-relaxed break-words text-destructive",
        )}
      >
        {message}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          onClick={onSkip}
          disabled={!onSkip}
          variant="outline"
        >
          跳过
        </Button>
        <Button
          type="button"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />
          ) : (
            <RotateCwIcon data-icon="inline-start" />
          )}
          重试
        </Button>
      </div>
    </div>
  );
}
