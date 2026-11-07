"use client";

import type { ComponentProps } from "react";
import { BotIcon, UserIcon, WrenchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mono } from "./surfaces";

export type SpeakerKind = "user" | "agent" | "subagent" | "tool";

export interface SpeakerTurn {
  id: string;
  kind: SpeakerKind;
  name: string;
  detail?: string;
  text: string;
}

const TONE: Record<SpeakerKind, string> = {
  user: "bg-muted text-muted-foreground",
  agent: "bg-accent text-accent-foreground",
  subagent: "bg-muted text-muted-foreground",
  tool: "bg-muted text-muted-foreground",
};

export function SpeakerIdentity({
  turns,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "turns"> & {
  turns: readonly SpeakerTurn[];
}) {
  return (
    <div
      data-slot="speaker-identity"
      className={cn("flex w-full max-w-sm flex-col gap-3.5", className)}

      {...props}
    >
      {turns.map((turn) => (
        <div key={turn.id} className="flex gap-2.5">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-border",
              TONE[turn.kind],
            )}
          >
            {turn.kind === "user" ? (
              <UserIcon className="size-3" />
            ) : turn.kind === "tool" ? (
              <WrenchIcon className="size-3" />
            ) : (
              <BotIcon className="size-3" />
            )}
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[13px] font-medium">{turn.name}</span>
              {turn.detail && (
                <span className={cn(mono, "text-muted-foreground")}>
                  {turn.detail}
                </span>
              )}
            </span>
            <span className="text-foreground/65 text-[13.5px] leading-relaxed break-words">
              {turn.text}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
