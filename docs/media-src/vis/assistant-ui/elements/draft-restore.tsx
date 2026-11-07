"use client";

import type { ComponentProps } from "react";
import { PencilLineIcon, XIcon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { ghostButton, mono, paper } from "./surfaces";

export function DraftRestore({
  draft,
  savedAt,
  onRestore,
  onDiscard,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "draft" | "savedAt" | "onRestore" | "onDiscard"
> & {
  draft: string;
  savedAt: string;
  onRestore?: () => void;
  onDiscard?: () => void;
}) {
  return (
    <div
      data-slot="draft-restore"
      className={cn(
        paper,
        "fade-in slide-in-from-bottom-1 animate-in flex w-full max-w-sm items-center gap-2.5 rounded-2xl py-2 pr-2 pl-3.5 duration-300",
        className,
      )}

      {...props}
    >
      <PencilLineIcon className="text-muted-foreground size-3.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-foreground/70 truncate text-[13px]">{draft}</span>
        <span className={cn(mono, "text-muted-foreground")}>
          未发送草稿· {savedAt}
        </span>
      </div>
      <Button
        type="button"
        onClick={onRestore}
      >
        恢复
      </Button>
      <button
        type="button"
        aria-label={"丢弃草稿"}
        onClick={onDiscard}
        className={cn(ghostButton, "size-7 shrink-0")}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
