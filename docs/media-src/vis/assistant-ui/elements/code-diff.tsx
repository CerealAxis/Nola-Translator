"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { codeScroll, codeSurface, mono, paper } from "./surfaces";

export type DiffKind = "context" | "added" | "removed";

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

const GUTTER: Record<DiffKind, string> = {
  context: "",
  added: "+",
  removed: "−",
};

export function CodeDiff({
  filename,
  additions,
  deletions,
  lines,
  cycle,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "filename" | "additions" | "deletions" | "lines" | "cycle"
> & {
  filename: string;
  additions: number;
  deletions: number;
  lines: readonly DiffLine[];
  cycle: number;
}) {
  return (
    <div
      data-slot="code-diff"
      className={cn(
        paper,
        "w-full max-w-md overflow-hidden rounded-2xl",
        className,
      )}

      {...props}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-foreground/90 type-body font-medium">{filename}</span>
        <span className={cn(mono, "tabular-nums")}>
          <span className="text-success-soft-foreground">
            +{additions}
          </span>{" "}
          <span className="text-danger-soft-foreground">−{deletions}</span>
        </span>
      </div>
      <div className={codeScroll}>
        <div className={cn(codeSurface, "type-code")}>
          {lines.map((line, i) => (
            <div
              key={`${cycle}-${i}-${line.text}`}
              className={cn(
                "fade-in animate-in fill-mode-both flex px-4 py-0.5 whitespace-pre duration-300",
                line.kind === "context" && "text-muted-foreground",
                line.kind === "added" &&
                  "bg-chart-2/10 text-success-soft-foreground",
                line.kind === "removed" &&
                  "bg-destructive/10 text-danger-soft-foreground",
              )}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="w-4 shrink-0 select-none">
                {GUTTER[line.kind]}
              </span>
              <span>{line.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
