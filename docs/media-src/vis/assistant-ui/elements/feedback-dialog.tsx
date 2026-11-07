"use client";

import type { ComponentProps } from "react";
import { CheckIcon, ThumbsDownIcon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";

export function FeedbackDialog({
  reasons,
  selected,
  note,
  sent,
  onToggleReason,
  onNoteChange,
  onSubmit,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "reasons"
  | "selected"
  | "note"
  | "sent"
  | "onToggleReason"
  | "onNoteChange"
  | "onSubmit"
> & {
  reasons: readonly string[];
  selected: readonly string[];
  note: string;
  sent: boolean;
  onToggleReason?: (reason: string) => void;
  onNoteChange?: (note: string) => void;
  onSubmit?: () => void;
}) {
  return (
    <div
      data-slot="feedback-dialog"
      className={cn(
        paper,
        "flex w-full max-w-sm p-4",
        sent ? "items-center gap-2.5 text-[13.5px]" : "flex-col gap-3",
        className,
      )}

      {...props}
    >
      {/*
        Mounted whether or not the feedback has been sent, because a live region
        only announces a change that happens after it is already in the tree; a
        region created together with its text is the case AT is free to miss.
      */}
      <div
        role="status"
        className={
          sent
            ? "fade-in animate-in flex items-center gap-2.5 duration-300"
            : "sr-only"
        }
      >
        {sent && (
          <>
            <CheckIcon className="size-4 shrink-0 text-emerald-500" />
            谢谢。这有助于我们调整模型。
          </>
        )}
      </div>

      {sent ? null : (
        <>
          <div className="flex items-center gap-2.5">
            <span className="bg-foreground/[0.05] text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
              <ThumbsDownIcon className="size-3.5" />
            </span>
            <span className="text-[13.5px] font-medium">出了什么问题？</span>
            <span className={cn(mono, "text-muted-foreground ms-auto")}>
              可选
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {reasons.map((reason) => {
              const active = selected.includes(reason);
              const className = cn(
                "rounded-full px-2.5 py-1 text-xs transition-[background-color,color,scale] duration-150",
                onToggleReason && "active:scale-[0.96]",
                active
                  ? "bg-accent text-accent-foreground"
                  : cn(
                      field,
                      "text-muted-foreground",
                      onToggleReason && "hover:text-foreground/90",
                    ),
              );
              return onToggleReason ? (
                <button
                  key={reason}
                  type="button"
                  aria-pressed={active}
                  data-preview-choice
                  onClick={() => onToggleReason(reason)}
                  className={className}
                >
                  {reason}
                </button>
              ) : (
                <span
                  key={reason}
                  role="button"
                  aria-disabled="true"
                  aria-pressed={active}
                  className={className}
                >
                  {reason}
                </span>
              );
            })}
          </div>

          <textarea
            data-preview-control="textarea"
            value={note}
            onChange={(event) => onNoteChange?.(event.target.value)}
            rows={2}
            placeholder={"还有吗？"}
            aria-label={"还有吗？"}
            className={cn(
              field,
              "text-foreground/80 placeholder:text-muted-foreground focus-visible:ring-foreground/20 resize-none rounded-xl px-3 py-2 text-xs outline-none focus-visible:ring-1",
            )}
          />

          {onSubmit && (
            <Button
              type="button"
              onClick={onSubmit}
              className="self-end"
            >
              发送反馈
            </Button>
          )}
        </>
      )}
    </div>
  );
}
