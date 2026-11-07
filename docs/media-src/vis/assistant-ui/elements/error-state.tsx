"use client";

import type { ComponentProps } from "react";
import { CircleAlertIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { ShimmerLabel } from "./surfaces";

export interface ErrorStateProps extends Omit<
  ComponentProps<"div">,
  "children" | "role"
> {
  title: string;
  detail: string;
  retrying: boolean;
  onRetry: () => void;
}

export function ErrorState({
  title,
  detail,
  retrying,
  onRetry,
  className,
  ...props
}: ErrorStateProps) {
  if (retrying) {
    return (
      <div
        data-slot="error-state"
        key="retrying"
        role="status"
        className={cn(
          "fade-in animate-in flex w-full max-w-sm items-center gap-2.5 text-sm duration-300 motion-reduce:animate-none",
          className,
        )}

        {...props}
      >
        <RefreshCwIcon className="text-muted-foreground size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
        <ShimmerLabel className="text-muted-foreground relative inline-block">
          重试
        </ShimmerLabel>
      </div>
    );
  }

  return (
    <div
      data-slot="error-state"
      key="error"
      role="alert"
      className={cn(
        "fade-in animate-in flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive duration-300 motion-reduce:animate-none",
        className,
      )}
      {...props}
    >
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-destructive/90">
          {detail}
        </p>
      </div>
      <Button
        type="button"
        onClick={onRetry}
        className="ms-auto"
      >
        <RefreshCwIcon data-icon="inline-start" />
        重试
      </Button>
    </div>
  );
}
