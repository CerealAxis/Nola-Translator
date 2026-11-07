"use client";

import type { ComponentProps } from "react";
import { KeyRoundIcon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";
import { useReceiptFocus } from "./receipt-focus";

export type GrantScope = "session" | "always" | "denied";

export function PermissionGrant({
  capability,
  requester,
  reach,
  scope,
  onGrant,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "capability" | "requester" | "reach" | "scope" | "onGrant"
> & {
  capability: string;
  requester: string;
  reach: readonly string[];
  scope: GrantScope | "pending";
  onGrant?: (scope: GrantScope) => void;
}) {
  const { receiptRef, focusHandlers } = useReceiptFocus(props);
  return (
    <div
      data-slot="permission-grant"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col gap-3.5 p-4",
        className,
      )}

      {...props}
      {...focusHandlers}
    >
      <div className="flex items-center gap-2.5">
        <span className="bg-foreground/[0.05] text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
          <KeyRoundIcon className="size-3.5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] font-medium">
            {capability}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            请求者 {requester}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className={cn(mono, "text-muted-foreground")}>本授予</span>
        {reach.map((item) => (
          <span
            key={item}
            className="text-foreground/60 flex items-baseline gap-2 text-xs"
          >
            <span
              aria-hidden
              className="bg-foreground/20 size-1 rounded-full"
            />
            {item}
          </span>
        ))}
      </div>

      <div className="flex min-h-9 flex-wrap items-center justify-end gap-2">
        {scope === "pending" ? (
          onGrant ? (
            <>
              <Button
                type="button"
                onClick={() => onGrant("denied")}
                variant="outline"
              >
                拒绝
              </Button>
              <Button
                type="button"
                onClick={() => onGrant("session")}
                variant="outline"
              >
                本次会话
              </Button>
              <Button
                type="button"
                onClick={() => onGrant("always")}
              >
                始终允许
              </Button>
            </>
          ) : (
            <span
              key={scope}
              className={cn(
                field,
                mono,
                "fade-in animate-in text-muted-foreground rounded-full px-2.5 py-1.5 duration-300",
              )}
            >
              待定
            </span>
          )
        ) : (
          <span
            key={scope}
            ref={receiptRef}
            tabIndex={-1}
            className={cn(
              field,
              mono,
              "fade-in animate-in text-muted-foreground rounded-full px-2.5 py-1.5 duration-300",
            )}
          >
            {scope === "denied" ? "否认" : `granted · ${scope}`}
          </span>
        )}
      </div>
    </div>
  );
}
