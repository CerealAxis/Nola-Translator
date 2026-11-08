"use client";

import type { ComponentProps } from "react";
import { ChevronRightIcon, PlugIcon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";

export type McpServerStatus =
  | "connected"
  | "connecting"
  | "needs-auth"
  | "failed";

export interface McpServer {
  id: string;
  name: string;
  transport: string;
  status: McpServerStatus;
  tools: readonly string[];
}

const DOT: Record<McpServerStatus, string> = {
  connected: "bg-chart-2",
  connecting: "bg-foreground/30 animate-pulse",
  "needs-auth": "bg-chart-4",
  failed: "bg-destructive",
};

const LABEL: Record<McpServerStatus, string> = {
  connected: "connected",
  connecting: "connecting",
  "needs-auth": "needs auth",
  failed: "failed",
};

export function McpServerPanel({
  servers,
  expandedId,
  onToggle,
  onAuthorize,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "servers" | "expandedId" | "onToggle" | "onAuthorize"
> & {
  servers: readonly McpServer[];
  expandedId?: string;
  onToggle?: (id: string) => void;
  onAuthorize?: (id: string) => void;
}) {
  const connected = servers.filter(
    (server) => server.status === "connected",
  ).length;

  return (
    <div
      data-slot="mcp-server-panel"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col gap-1 rounded-2xl p-3",
        className,
      )}

      {...props}
    >
      <div className="flex items-baseline justify-between px-1 pb-1">
        <span className="text-[13.5px] font-medium">服务器</span>
        <span className={cn(mono, "text-muted-foreground tabular-nums")}>
          {connected} 的 {servers.length} 已连接
        </span>
      </div>

      {servers.map((server) => {
        const expanded = expandedId === server.id;
        const rowClassName = cn(
          "flex items-center gap-2.5 rounded-xl px-1.5 py-2 text-start",
          onToggle && "hover:bg-foreground/[0.04] transition-colors",
        );
        const row = (
          <>
            <ChevronRightIcon
              className={cn(
                "text-muted-foreground size-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
                expanded && "rotate-90",
              )}
            />
            <PlugIcon className="text-muted-foreground size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[13.5px]">
              {server.name}
            </span>
            <span className={cn(mono, "text-muted-foreground shrink-0")}>
              {server.tools.length} 工具
            </span>
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                DOT[server.status],
              )}
            />
            <span className="sr-only">{LABEL[server.status]}</span>
          </>
        );
        return (
          <div key={server.id} className="flex flex-col">
            {onToggle ? (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => onToggle(server.id)}
                className={rowClassName}
              >
                {row}
              </button>
            ) : (
              <div className={rowClassName}>{row}</div>
            )}

            {expanded && (
              <div className="fade-in slide-in-from-top-1 animate-in flex flex-col gap-1.5 px-1.5 ps-8 pb-2 duration-200">
                <div className="flex items-center gap-2">
                  <span className={cn(mono, "text-muted-foreground")}>
                    {server.transport}
                  </span>
                  <span className={cn(mono, "text-muted-foreground")}>
                    · {LABEL[server.status]}
                  </span>
                  {server.status === "needs-auth" && onAuthorize && (
                    <Button
                      type="button"
                      onClick={() => onAuthorize(server.id)}
                      size="sm"
                      className="ms-auto"
                    >
                      授权
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {server.tools.map((tool) => (
                    <span
                      key={tool}
                      className={cn(
                        field,
                        mono,
                        "text-muted-foreground rounded-md px-1.5 py-0.5",
                      )}
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
