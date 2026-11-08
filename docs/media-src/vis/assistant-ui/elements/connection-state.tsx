"use client";

import type { ComponentProps } from "react";
import { CheckIcon, CloudOffIcon, Loader2Icon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";

export type ConnectionPhase = "online" | "dropped" | "reconnecting" | "resumed";

export function ConnectionState({
  phase,
  attempt,
  resumedTokens,
  onRetry,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "phase" | "attempt" | "resumedTokens" | "onRetry"
> & {
  phase: ConnectionPhase;
  attempt?: number;
  resumedTokens?: number;
  onRetry?: () => void;
}) {
  if (phase === "online") return null;

  return (
    <div
      data-slot="connection-state"
      className={cn(
        paper,
        "fade-in slide-in-from-top-1 animate-in flex w-full max-w-sm items-center gap-2.5 rounded-2xl px-3.5 py-2.5 duration-300",
        className,
      )}

      {...props}
    >
      {phase === "dropped" && (
        <>
          <CloudOffIcon className="size-3.5 shrink-0 text-chart-4" />
          <span className="min-w-0 flex-1 text-[13px]">
            连接丢失。运行在服务器上继续进行。
          </span>
          <Button
            type="button"
            onClick={onRetry}
          >
            重新连接
          </Button>
        </>
      )}

      {phase === "reconnecting" && (
        <>
          <Loader2Icon className="text-muted-foreground size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
          <span className="min-w-0 flex-1 text-[13px]">重连</span>
          {attempt !== undefined && (
            <span
              className={cn(
                mono,
                "text-muted-foreground shrink-0 tabular-nums",
              )}
            >
              尝试 {attempt}
            </span>
          )}
        </>
      )}

      {phase === "resumed" && (
        <>
          <CheckIcon className="size-3.5 shrink-0 text-chart-2" />
          <span className="min-w-0 flex-1 text-[13px]">
            已重新选择流。
          </span>
          {resumedTokens !== undefined && (
            <span
              className={cn(
                mono,
                "text-muted-foreground shrink-0 tabular-nums",
              )}
            >
              +{resumedTokens} 代币
            </span>
          )}
        </>
      )}
    </div>
  );
}
