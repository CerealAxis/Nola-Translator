"use client";

import type { ComponentProps } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { codeScroll, codeSurface, mono, paper } from "./surfaces";
import type { DiffLine } from "./code-diff";

export type HunkDecision = "pending" | "kept" | "discarded";

export interface DiffHunk {
  id: string;
  range: string;
  decision: HunkDecision;
  lines: readonly DiffLine[];
}

const GUTTER = { context: "", added: "+", removed: "−" } as const;

export function ReviewableDiff({
  filename,
  hunks,
  onKeep,
  onDiscard,
  onApply,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "filename" | "hunks" | "onKeep" | "onDiscard" | "onApply"
> & {
  filename: string;
  hunks: readonly DiffHunk[];
  onKeep?: (id: string) => void;
  onDiscard?: (id: string) => void;
  onApply?: () => void;
}) {
  const kept = hunks.filter((hunk) => hunk.decision === "kept").length;
  const pending = hunks.filter((hunk) => hunk.decision === "pending").length;

  return (
    <div
      data-slot="reviewable-diff"
      className={cn(
        paper,
        "flex w-full max-w-md flex-col overflow-hidden rounded-2xl",
        className,
      )}

      {...props}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="font-mono text-xs">{filename}</span>
        <span className={cn(mono, "text-muted-foreground tabular-nums")}>
          {kept} 的 {hunks.length} 保留
        </span>
      </div>

      <div className="flex flex-col">
        {hunks.map((hunk) => (
          <div
            key={hunk.id}
            className={cn(
              "border-foreground/[0.06] border-t transition-opacity duration-300",
              hunk.decision === "discarded" && "opacity-40",
            )}
          >
            <div className="flex items-center gap-2 px-4 py-1.5">
              <span className={cn(mono, "text-muted-foreground")}>
                {hunk.range}
              </span>
              <span className="ms-auto flex items-center gap-1">
                {hunk.decision === "pending" && (onKeep || onDiscard) ? (
                  <>
                    {onDiscard && (
                      <Button
                        type="button"
                        aria-label={`舍弃改动 ${hunk.range}`}
                        onClick={() => onDiscard(hunk.id)}
                        variant="outline"
                        size="sm"
                      >
                        <XIcon className="size-3" />
                        丢弃
                      </Button>
                    )}
                    {onKeep && (
                      <Button
                        type="button"
                        aria-label={`保留改动 ${hunk.range}`}
                        onClick={() => onKeep(hunk.id)}
                        variant="outline"
                        size="sm"
                      >
                        <CheckIcon className="size-3" />
                        保留
                      </Button>
                    )}
                  </>
                ) : (
                  <span
                    className={cn(
                      mono,
                      "fade-in animate-in duration-300",
                      hunk.decision === "kept"
                        ? "text-chart-2"
                        : "text-muted-foreground",
                    )}
                  >
                    {hunk.decision}
                  </span>
                )}
              </span>
            </div>
            <div className={cn(codeScroll, "pb-1.5 font-mono text-xs")}>
              <div className={codeSurface}>
                {hunk.lines.map((line, i) => (
                  <div
                    key={`${hunk.id}-${i}`}
                    className={cn(
                      "flex px-4 py-0.5 leading-relaxed whitespace-pre",
                      line.kind === "context" && "text-muted-foreground",
                      line.kind === "added" &&
                        "bg-chart-2/10 text-chart-2",
                      line.kind === "removed" &&
                        "bg-destructive/10 text-destructive",
                    )}
                  >
                    <span className="w-4 shrink-0 select-none">
                      {GUTTER[line.kind]}
                    </span>
                    <span>{line.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-foreground/[0.06] flex items-center justify-between border-t px-4 py-2.5">
        <span className={cn(mono, "text-muted-foreground")}>
          {pending > 0 ? `${pending} left to review` : "已全部审核"}
        </span>
        {onApply && (
          <Button
            type="button"
            disabled={pending > 0}
            onClick={onApply}
          >
            应用 {kept}
          </Button>
        )}
      </div>
    </div>
  );
}
