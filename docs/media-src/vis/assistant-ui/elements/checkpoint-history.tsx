"use client";

import type { ComponentProps } from "react";
import { RotateCcwIcon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";

export interface Checkpoint {
  id: string;
  label: string;
  at: string;
  files: number;
}

export function CheckpointHistory({
  checkpoints,
  currentId,
  onRestore,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "checkpoints" | "currentId" | "onRestore"
> & {
  checkpoints: readonly Checkpoint[];
  currentId: string;
  onRestore?: (id: string) => void;
}) {
  const currentIndex = checkpoints.findIndex(
    (checkpoint) => checkpoint.id === currentId,
  );

  return (
    <div
      data-slot="checkpoint-history"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col gap-1 rounded-2xl p-3",
        className,
      )}

      {...props}
    >
      <span className="px-1.5 pb-1 text-[13.5px] font-medium">检查点</span>

      {checkpoints.map((checkpoint, i) => {
        const ahead = currentIndex >= 0 && i > currentIndex;
        const current = checkpoint.id === currentId;

        return (
          <div
            key={checkpoint.id}
            className={cn(
              "group flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors",
              current ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground",
              ahead && "opacity-40",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                current
                  ? "bg-primary"
                  : ahead
                    ? "border-foreground/25 border"
                    : "bg-foreground/25",
              )}
            />

            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px]">{checkpoint.label}</span>
              <span className={cn(mono, "text-muted-foreground")}>
                {checkpoint.at} · {checkpoint.files} 文件
              </span>
            </span>

            {current ? (
              <span className={cn(mono, "text-muted-foreground shrink-0")}>
                当前
              </span>
            ) : onRestore ? (
              <Button
                type="button"
                aria-label={`恢复到${checkpoint.label}`}
                onClick={() => onRestore(checkpoint.id)}
                variant="outline"
                size="sm"
                className="shrink-0"
              >
                <RotateCcwIcon className="size-2.5" />
                恢复
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
