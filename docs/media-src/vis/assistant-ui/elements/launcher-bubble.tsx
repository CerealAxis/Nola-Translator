"use client";

import type { ComponentProps } from "react";
import { MessageCircleIcon, XIcon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { field, floating, inkButton, mono } from "./surfaces";

export function LauncherBubble({
  open,
  unread,
  greeting,
  prompts,
  onToggle,
  onPick,
  onStart,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "open"
  | "unread"
  | "greeting"
  | "prompts"
  | "onToggle"
  | "onPick"
  | "onStart"
> & {
  open: boolean;
  unread: number;
  greeting: string;
  prompts: readonly string[];
  onToggle?: () => void;
  onPick?: (prompt: string) => void;
  onStart?: () => void;
}) {
  const bubble = (
    <>
      <span className="grid">
        <MessageCircleIcon
          className={cn(
            "size-5 transition-[opacity,rotate] duration-200 [grid-area:1/1]",
            open && "rotate-90 opacity-0",
          )}
        />
        <XIcon
          className={cn(
            "size-5 transition-[opacity,rotate] duration-200 [grid-area:1/1]",
            !open && "-rotate-90 opacity-0",
          )}
        />
      </span>

      {unread > 0 && !open && (
        <span
          className={cn(
            mono,
            "bg-background text-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full tabular-nums",
          )}
        >
          {unread}
        </span>
      )}
    </>
  );

  return (
    <div
      data-slot="launcher-bubble"
      className={cn(
        "flex w-full max-w-[19rem] flex-col items-end gap-2.5",
        className,
      )}

      {...props}
    >
      {open && (
        <div
          className={cn(
            floating,
            "fade-in zoom-in-95 slide-in-from-bottom-2 animate-in flex w-full flex-col gap-3 p-4 duration-200",
          )}
        >
          <div className="flex flex-col gap-1">
            <span className="text-[13.5px] font-medium">{greeting}</span>
            <span className={cn(mono, "text-muted-foreground")}>
              通常会在一分钟内回复
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            {prompts.map((prompt) =>
              onPick ? (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onPick(prompt)}
                  className={cn(
                    field,
                    "hover:bg-foreground/[0.07] text-foreground/70 rounded-xl px-3 py-2 text-start text-[13px] transition-colors",
                  )}
                >
                  {prompt}
                </button>
              ) : (
                <span
                  key={prompt}
                  className={cn(
                    field,
                    "text-foreground/70 rounded-xl px-3 py-2 text-[13px]",
                  )}
                >
                  {prompt}
                </span>
              ),
            )}
          </div>

          {onStart && (
            <Button
              type="button"
              onClick={onStart}
            >
              开始对话
            </Button>
          )}
        </div>
      )}

      {onToggle && (
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "关闭助手" : "打开助手"}
          onClick={onToggle}
          className={cn(
            inkButton,
            "relative flex size-12 shrink-0 items-center justify-center rounded-full",
          )}
        >
          {bubble}
        </button>
      )}

      {!onToggle && !open && (
        <div className="bg-primary text-primary-foreground relative flex size-12 shrink-0 items-center justify-center rounded-full">
          {bubble}
        </div>
      )}
    </div>
  );
}
