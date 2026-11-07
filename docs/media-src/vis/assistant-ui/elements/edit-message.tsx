"use client";

import type { ComponentProps } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";

export function EditMessage({
  value,
  discardedReplies,
  editing,
  onValueChange,
  onSave,
  onCancel,
  onStartEdit,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "value"
  | "discardedReplies"
  | "editing"
  | "onValueChange"
  | "onSave"
  | "onCancel"
  | "onStartEdit"
> & {
  value: string;
  discardedReplies: number;
  editing: boolean;
  onValueChange?: (value: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  onStartEdit?: () => void;
}) {
  if (!editing) {
    return (
      <div
        data-slot="edit-message"
        className={cn("flex w-full max-w-sm justify-end", className)}
        {...props}
      >
        <button
          type="button"
          onClick={onStartEdit}
          className={cn(
            field,
            "hover:bg-foreground/[0.07] max-w-[85%] rounded-2xl px-3.5 py-2.5 text-start text-[13.5px] transition-colors",
          )}
        >
          {value}
        </button>
      </div>
    );
  }

  return (
    <div
      data-slot="edit-message"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col gap-3 p-3.5",
        className,
      )}

      {...props}
    >
      <textarea
        data-preview-control="textarea"
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
        rows={2}
        aria-label={"编辑您的留言"}
        className={cn(
          field,
          "text-foreground/90 focus-visible:ring-foreground/20 resize-none rounded-xl px-3 py-2.5 text-[13.5px] leading-relaxed outline-none focus-visible:ring-1",
        )}
      />

      {discardedReplies > 0 && (
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangleIcon className="size-3.5 shrink-0" />
          <span className={cn(mono, "tabular-nums")}>
            发送丢弃 {discardedReplies}{" "}
            {discardedReplies === 1 ? "回复" : "回复"}
          </span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          onClick={onCancel}
          variant="outline"
        >
          取消
        </Button>
        <Button
          type="button"
          onClick={onSave}
        >
          发送
        </Button>
      </div>
    </div>
  );
}
