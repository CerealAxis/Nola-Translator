"use client";

import type { ComponentProps } from "react";
import { ArrowRightIcon, SquareIcon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { field, mono } from "./surfaces";

export function StoppedRun({
  words,
  wordSeparator = " ",
  reason,
  onContinue,
  onDiscard,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "words" | "reason" | "onContinue" | "onDiscard"
> & {
  words: readonly string[];
  wordSeparator?: string;
  reason: string;
  onContinue?: () => void;
  onDiscard?: () => void;
}) {
  return (
    <div
      data-slot="stopped-run"
      className={cn("flex w-full max-w-sm flex-col gap-3", className)}

      {...props}
    >
      <p className="text-foreground/80 text-[13.5px] leading-relaxed">
        {words.join(wordSeparator)}
        <span
          aria-hidden
          className="bg-foreground/20 ms-1 inline-block h-[1em] w-[2px] translate-y-[0.15em] rounded-full"
        />
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            field,
            mono,
            "text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
          )}
        >
          <SquareIcon className="size-2.5 fill-current" />
          {reason}
        </span>

        <Button
          type="button"
          onClick={onDiscard}
          variant="outline"
          className="ms-auto"
        >
          丢弃
        </Button>
        <Button
          type="button"
          onClick={onContinue}
        >
          继续
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}
