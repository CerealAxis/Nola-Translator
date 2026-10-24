"use client";

import type { ComponentProps } from "react";
import { useState } from "react";
import { ArchiveIcon, MoreHorizontalIcon, PencilIcon, PinIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, mono } from "./surfaces";
import { ComposerMenuItem } from "./composer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ThreadItem {
  id: string;
  title: string;
  time: string;
  unread?: boolean;
  pinned?: boolean;
}

export function ThreadList({
  threads,
  activeIndex,
  dateLabel,
  onActiveIndexChange,
  onRename,
  onDelete,
  onPin,
  onArchive,
  labels,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "threads"
  | "activeIndex"
  | "dateLabel"
  | "onActiveIndexChange"
  | "onRename"
  | "onDelete"
  | "onPin"
  | "onArchive"
  | "labels"
> & {
  threads: readonly ThreadItem[];
  activeIndex: number;
  dateLabel: string;
  onActiveIndexChange?: (index: number) => void;
  onRename?: (index: number, title: string) => void;
  onDelete?: (index: number) => void;
  onPin?: (index: number) => void;
  onArchive?: (index: number) => void;
  labels?: { more: string; rename: string; pin: string; unpin: string; archive: string; delete: string };
}) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  return (
    <div
      data-slot="thread-list"
      className={cn("flex w-full max-w-[240px] flex-col gap-0.5", className)}

      {...props}
    >
      <div className={cn(mono, "text-muted-foreground px-3 pb-1.5")}>{dateLabel}</div>
      {threads.map((thread, i) => {
        const active = i === activeIndex;
        const hasActions = onRename !== undefined || onDelete !== undefined || onPin !== undefined || onArchive !== undefined;
        const rowClassName = cn(
          "group relative flex w-full items-center rounded-xl text-[13.5px] transition-colors",
          active
            ? field
            : onActiveIndexChange
              ? "hover:bg-foreground/[0.03]"
              : undefined,
        );
        const contentClassName = cn(
          "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-3 py-2 text-start",
          hasActions &&
            (onActiveIndexChange
              ? "group-focus-within:pe-9 group-hover:pe-9"
              : "pe-9"),
        );
        const content = (
          <>
            <span className="flex-1 truncate">{thread.title}</span>
            <span
              className={cn(
                mono,
                "text-muted-foreground flex items-center gap-1.5 tabular-nums",
                hasActions &&
                  onActiveIndexChange &&
                  "group-focus-within:hidden group-hover:hidden",
              )}
            >
              {thread.unread && !active && (
                <>
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-blue-500 dark:bg-blue-400"
                  />
                  <span className="sr-only">unread</span>
                </>
              )}
              {thread.time}
            </span>
          </>
        );

        return (
          <div key={thread.id} className={rowClassName}>
            {editing === i ? <input autoFocus aria-label={labels?.rename} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); onRename?.(i, draft); setEditing(null); setOpenMenu(null); } if (event.key === "Escape") setEditing(null); }} onBlur={() => setEditing(null)} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /> : onActiveIndexChange ? (
              <button
                type="button"
                aria-current={active || undefined}
                onClick={() => onActiveIndexChange(i)}
                className={contentClassName}
              >
                {content}
              </button>
            ) : (
              <div
                aria-current={active || undefined}
                className={contentClassName}
              >
                {content}
              </div>
            )}
            {hasActions && (
              <Popover open={openMenu === i} onOpenChange={open => setOpenMenu(open ? i : null)}>
                <PopoverTrigger render={<button type="button" aria-label={labels?.more} className="rounded-full bg-transparent p-1.5 text-muted-foreground hover:bg-transparent hover:text-foreground" />}>
                  <MoreHorizontalIcon className="size-4" aria-hidden="true" />
                </PopoverTrigger>
                <PopoverContent align="end" side="bottom" sideOffset={4} className="w-56 gap-0.5 rounded-2xl border border-border bg-background p-1.5 text-foreground shadow-lg">
                  {onRename && <ComposerMenuItem onClick={() => { setDraft(thread.title); setEditing(i); setOpenMenu(null); }}><PencilIcon className="size-4" aria-hidden="true" />{labels?.rename}</ComposerMenuItem>}
                  {onPin && <ComposerMenuItem onClick={() => { onPin(i); setOpenMenu(null); }}><PinIcon className="size-4" aria-hidden="true" />{thread.pinned ? labels?.unpin : labels?.pin}</ComposerMenuItem>}
                  {onArchive && <ComposerMenuItem onClick={() => { onArchive(i); setOpenMenu(null); }}><ArchiveIcon className="size-4" aria-hidden="true" />{labels?.archive}</ComposerMenuItem>}
                  {onDelete && <ComposerMenuItem className="text-destructive" onClick={() => { onDelete(i); setOpenMenu(null); }}><Trash2Icon className="size-4" aria-hidden="true" />{labels?.delete}</ComposerMenuItem>}
                </PopoverContent>
              </Popover>
            )}
          </div>
        );
      })}
    </div>
  );
}
