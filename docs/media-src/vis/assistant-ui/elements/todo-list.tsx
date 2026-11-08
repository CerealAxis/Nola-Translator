"use client";

import { useId, useState, type ComponentProps } from "react";
import { CheckIcon, Loader2Icon, MinusIcon, XIcon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { mono } from "./surfaces";
import { clamp } from "../utils/range";

export type TodoStatus = "pending" | "active" | "done" | "failed" | "cancelled";

const statusLabels: Record<TodoStatus, string> = {
  pending: "待处理",
  active: "进行中",
  done: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

export interface TodoItem {
  id: string;
  text: string;
  status: TodoStatus;
  description?: string | undefined;
  reason?: string | undefined;
}

export function TodoList({
  items,
  revision,
  title = "待办事项",
  description,
  maxVisible,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "items" | "revision" | "title"> & {
  items: readonly TodoItem[];
  revision?: number | undefined;
  title?: string | undefined;
  description?: string | undefined;
  maxVisible?: number | undefined;
}) {
  const done = items.filter((item) => item.status === "done").length;
  const total = items.filter((item) => item.status !== "cancelled").length;
  const visibleCount = Math.floor(
    clamp(maxVisible ?? items.length, 0, items.length),
  );
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hiddenItems = items.filter(
    (item, index) =>
      index >= visibleCount &&
      item.status !== "active" &&
      item.status !== "failed",
  );
  const canFold = maxVisible !== undefined && hiddenItems.length > 0;

  return (
    <div
      data-slot="todo-list"
      className={cn("flex w-full max-w-sm flex-col gap-3", className)}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[13.5px] font-medium">{title}</span>
          {description ? (
            <p className="text-muted-foreground text-xs leading-4 break-words">
              {description}
            </p>
          ) : null}
        </div>
        <span
          className={cn(
            mono,
            "text-muted-foreground shrink-0 whitespace-nowrap tabular-nums",
          )}
        >
          {revision === undefined
            ? `${done}/${total}`
            : `${done}/${total} · 版本 ${revision}`}
        </span>
      </div>
      <ul id={listId} className="flex flex-col gap-1">
        {items.map((item, index) => {
          const collapsed =
            canFold &&
            index >= visibleCount &&
            item.status !== "active" &&
            item.status !== "failed";
          const rowClassName =
            "fade-in slide-in-from-bottom-1 animate-in fill-mode-both flex items-start gap-2.5 py-0.5 text-[13.5px] duration-300 motion-reduce:animate-none";
          const row = (
            <>
              <span
                aria-hidden
                className="flex size-4 h-5 shrink-0 items-center justify-center"
              >
                {item.status === "done" ? (
                  <span className="border-foreground/20 bg-foreground/[0.06] flex size-3.5 items-center justify-center rounded-[5px] border">
                    <CheckIcon className="text-muted-foreground size-2.5" />
                  </span>
                ) : item.status === "failed" ? (
                  <span className="flex size-3.5 items-center justify-center rounded-[5px] border border-destructive/25 bg-destructive/[0.08]">
                    <XIcon className="size-2.5 text-destructive" />
                  </span>
                ) : item.status === "cancelled" ? (
                  <span className="border-foreground/15 text-muted-foreground flex size-3.5 items-center justify-center rounded-[5px] border">
                    <MinusIcon className="size-2.5" />
                  </span>
                ) : item.status === "active" ? (
                  <Loader2Icon className="size-3.5 animate-spin text-primary motion-reduce:animate-none" />
                ) : (
                  <span className="border-foreground/15 size-3.5 rounded-[5px] border" />
                )}
              </span>
              <span className="sr-only">{statusLabels[item.status]}</span>
              <div className="min-w-0 flex-1 leading-5 break-words">
                <span
                  className={cn(
                    item.status === "done" &&
                      "text-muted-foreground line-through decoration-[1.5px]",
                    item.status === "active" && "text-foreground/90",
                    item.status === "pending" && "text-muted-foreground",
                    item.status === "failed" &&
                      "text-destructive",
                    item.status === "cancelled" &&
                      "text-muted-foreground line-through decoration-[1.5px]",
                  )}
                >
                  {item.text}
                </span>
                {item.status === "failed" ? (
                  item.reason ? (
                    <p className="text-muted-foreground text-xs leading-4 break-words">
                      {item.reason}
                    </p>
                  ) : null
                ) : item.status !== "cancelled" && item.description ? (
                  <p className="text-muted-foreground text-xs leading-4 break-words">
                    {item.description}
                  </p>
                ) : null}
              </div>
            </>
          );

          if (collapsed && !expanded) return null;

          return (
            <li
              key={item.id}
              data-status={item.status}
              className={rowClassName}
            >
              {row}
            </li>
          );
        })}
      </ul>
      {canFold ? (
        <Button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((current) => !current)}
          variant="outline"
          size="sm"
          className="self-start"
        >
          {expanded ? "显示较少" : `Show ${hiddenItems.length} more`}
        </Button>
      ) : null}
    </div>
  );
}
