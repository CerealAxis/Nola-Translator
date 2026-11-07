"use client";

import type { ComponentProps, CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";
import { clamp, pct } from "../utils/range";

export interface SettingToggle {
  key: string;
  label: string;
  detail: string;
  on: boolean;
}

export function SettingsPanel({
  model,
  models,
  systemPrompt,
  temperature,
  toggles,
  onModelChange,
  onSystemPromptChange,
  onTemperatureChange,
  onToggle,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "model"
  | "models"
  | "systemPrompt"
  | "temperature"
  | "toggles"
  | "onModelChange"
  | "onSystemPromptChange"
  | "onTemperatureChange"
  | "onToggle"
> & {
  model: string;
  models: readonly string[];
  systemPrompt: string;
  temperature: number;
  toggles: readonly SettingToggle[];
  onModelChange?: (model: string) => void;
  onSystemPromptChange?: (prompt: string) => void;
  onTemperatureChange?: (temperature: number) => void;
  onToggle?: (key: string) => void;
}) {
  return (
    <div
      data-slot="settings-panel"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col gap-4 p-4",
        className,
      )}

      {...props}
    >
      <div className="flex flex-col gap-1.5">
        <span className={cn(mono, "text-muted-foreground")}>型号</span>
        <div className={cn(field, "flex gap-0.5 rounded-full p-0.5")}>
          {models.map((option) => {
            const className = cn(
              "flex-1 rounded-full py-1 text-xs font-medium transition-[background-color,color,scale] duration-150",
              onModelChange && "active:scale-[0.97]",
              option === model
                ? "bg-accent text-accent-foreground"
                : onModelChange
                  ? "text-muted-foreground hover:text-foreground/70"
                  : "text-muted-foreground",
            );

            return onModelChange ? (
              <button
                key={option}
                type="button"
                aria-pressed={option === model}
                data-preview-choice
                onClick={() => onModelChange(option)}
                className={className}
              >
                {option}
              </button>
            ) : (
              <span
                key={option}
                aria-current={option === model ? "true" : undefined}
                className={className}
              >
                {option}
              </span>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={cn(mono, "text-muted-foreground")}>系统提示</span>
        <textarea
          data-preview-control="textarea"
          value={systemPrompt}
          onChange={(event) => onSystemPromptChange?.(event.target.value)}
          rows={3}
          aria-label={"系统提示"}
          className={cn(
            field,
            "text-foreground/80 focus-visible:ring-foreground/20 resize-none rounded-xl px-3 py-2 text-xs leading-relaxed outline-none focus-visible:ring-1",
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="flex items-baseline justify-between">
          <span className={cn(mono, "text-muted-foreground")}>温度</span>
          <span className={cn(mono, "text-muted-foreground tabular-nums")}>
            {clamp(temperature, 0, 2).toFixed(1)}
          </span>
        </span>
        <input
          type="range"
          data-preview-slider
          style={{ "--preview-slider-fill": `${pct(temperature, 2)}%` } as CSSProperties}
          min={0}
          max={2}
          step={0.1}
          value={clamp(temperature, 0, 2)}
          aria-label={"温度"}
          onChange={(event) =>
            onTemperatureChange?.(Number(event.target.value))
          }
          className="accent-foreground/80 h-1 w-full"
        />
      </div>

      <div className="flex flex-col gap-2.5">
        {toggles.map((toggle) => (
          <div key={toggle.key} className="flex items-center gap-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px]">{toggle.label}</span>
              <span className="text-muted-foreground truncate text-xs">
                {toggle.detail}
              </span>
            </span>
            {onToggle ? (
              <button
                type="button"
                role="switch"
                aria-checked={toggle.on}
                aria-label={toggle.label}
                onClick={() => onToggle(toggle.key)}
                data-preview-switch
              >
                <span data-preview-switch-thumb />
              </button>
            ) : (
              <span
                role="switch"
                aria-checked={toggle.on}
                aria-disabled="true"
                aria-label={toggle.label}
                data-preview-switch
              >
                <span data-preview-switch-thumb />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
