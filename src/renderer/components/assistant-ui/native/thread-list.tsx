"use client";

import type { ComponentProps } from "react";
import { useState } from "react";
import { ArchiveIcon, MessageSquareIcon, MoreHorizontalIcon, PencilIcon, PinIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavigationItem } from "@/components/primitives/NavigationItem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import { ComposerMenuItem } from "./composer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ThreadItem {
  id: string;
  title: string;
  time: string;
  dateLabel?: string;
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
      className={cn("w-full", className)}

      {...props}
    >
      <SidebarGroup>
      {threads.map((thread, i) => {
        const active = i === activeIndex;
        const hasActions = onRename !== undefined || onDelete !== undefined || onPin !== undefined || onArchive !== undefined;
        return (
          <div key={thread.id}>
          {(i === 0 || (thread.dateLabel ?? dateLabel) !== (threads[i - 1]?.dateLabel ?? dateLabel)) && <SidebarGroupLabel>{thread.dateLabel ?? dateLabel}</SidebarGroupLabel>}
          <SidebarMenu><SidebarMenuItem className="nola-workbench-thread" data-has-actions={hasActions || undefined}>
            {editing === i ? <Input autoFocus aria-label={labels?.rename} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); onRename?.(i, draft); setEditing(null); setOpenMenu(null); } if (event.key === "Escape") setEditing(null); }} onBlur={() => setEditing(null)} /> : <NavigationItem icon={thread.pinned ? PinIcon : MessageSquareIcon} label={thread.title} active={active} onPress={onActiveIndexChange ? () => onActiveIndexChange(i) : undefined} />}
            {thread.unread && !active && <span aria-hidden="true" className="nola-workbench-thread__unread" />}
            {hasActions && (
              <Popover open={openMenu === i} onOpenChange={open => setOpenMenu(open ? i : null)}>
                <PopoverTrigger render={<Button variant="bare" size="icon-xs" aria-label={labels?.more} className="nola-workbench-thread__more" />}>
                  <MoreHorizontalIcon aria-hidden="true" />
                </PopoverTrigger>
                <PopoverContent align="end" side="bottom" sideOffset={4} className="w-56 gap-0.5 p-1.5">
                  {onRename && <ComposerMenuItem onClick={() => { setDraft(thread.title); setEditing(i); setOpenMenu(null); }}><PencilIcon className="size-4" aria-hidden="true" />{labels?.rename}</ComposerMenuItem>}
                  {onPin && <ComposerMenuItem onClick={() => { onPin(i); setOpenMenu(null); }}><PinIcon className="size-4" aria-hidden="true" />{thread.pinned ? labels?.unpin : labels?.pin}</ComposerMenuItem>}
                  {onArchive && <ComposerMenuItem onClick={() => { onArchive(i); setOpenMenu(null); }}><ArchiveIcon className="size-4" aria-hidden="true" />{labels?.archive}</ComposerMenuItem>}
                  {onDelete && <ComposerMenuItem className="text-destructive" onClick={() => { onDelete(i); setOpenMenu(null); }}><Trash2Icon className="size-4" aria-hidden="true" />{labels?.delete}</ComposerMenuItem>}
                </PopoverContent>
              </Popover>
            )}
          </SidebarMenuItem></SidebarMenu>
          </div>
        );
      })}
      </SidebarGroup>
    </div>
  );
}
