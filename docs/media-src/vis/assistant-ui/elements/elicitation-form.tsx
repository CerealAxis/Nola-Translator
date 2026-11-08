"use client";

import { useId, type ComponentProps } from "react";
import { CheckIcon, PlugIcon, XIcon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";
import { useReceiptFocus } from "./receipt-focus";

export type ElicitationState = "request" | "accepted" | "declined";

export interface ElicitationField {
  name: string;
  label: string;
  value: string;
  kind: "text" | "choice" | "toggle";
  options?: readonly string[];
  required?: boolean;
}

function Toggle({ value }: { value: string }) {
  const enabled = value === "true";
  return (
    <>
      <span
        aria-hidden
        data-preview-switch
        data-checked={enabled || undefined}
      >
        <span data-preview-switch-thumb />
      </span>
      <span className="text-muted-foreground text-xs">
        {enabled ? "开" : "关闭"}
      </span>
    </>
  );
}

export function ElicitationForm({
  server,
  message,
  fields,
  state,
  onFieldChange,
  onAccept,
  onDecline,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "server"
  | "message"
  | "fields"
  | "state"
  | "onFieldChange"
  | "onAccept"
  | "onDecline"
> & {
  server: string;
  message: string;
  fields: readonly ElicitationField[];
  state: ElicitationState;
  onFieldChange?: ((name: string, value: string) => void) | undefined;
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const fieldPrefix = useId();
  const { receiptRef, focusHandlers } = useReceiptFocus(props);
  const interactive = state === "request" && onFieldChange !== undefined;
  const missingRequired =
    interactive &&
    fields.some(
      (item) =>
        item.kind !== "toggle" &&
        item.required === true &&
        item.value.trim() === "",
    );

  return (
    <div
      data-slot="elicitation-form"
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
          <PlugIcon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
          {server}
        </span>
        <span className={cn(mono, "text-muted-foreground shrink-0")}>
          需要输入
        </span>
      </div>

      <p className="text-muted-foreground text-xs leading-relaxed">{message}</p>

      <div className="flex flex-col gap-2.5">
        {fields.map((item, index) => {
          const labelId = `${fieldPrefix}-${index}`;
          const inputId = `${labelId}-input`;
          return (
            <div key={item.name} className="flex flex-col gap-1">
              {item.kind === "text" && interactive ? (
                <label
                  id={labelId}
                  htmlFor={inputId}
                  className={cn(mono, "text-muted-foreground")}
                >
                  {item.label}
                  {item.required && (
                    <span className="text-muted-foreground"> *</span>
                  )}
                </label>
              ) : (
                <span
                  id={labelId}
                  className={cn(mono, "text-muted-foreground")}
                >
                  {item.label}
                  {item.required && (
                    <span className="text-muted-foreground"> *</span>
                  )}
                </span>
              )}
              {item.kind === "choice" ? (
                <div
                  role={interactive ? "group" : undefined}
                  aria-labelledby={interactive ? labelId : undefined}
                  className="flex flex-wrap gap-1.5"
                >
                  {item.options?.map((option) =>
                    interactive ? (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={option === item.value}
                        data-preview-choice
                        onClick={() => onFieldChange(item.name, option)}
                        className={cn(
                          "focus-visible:ring-foreground/20 rounded-full px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-1",
                          option === item.value
                            ? "bg-accent text-accent-foreground"
                            : cn(field, "text-muted-foreground"),
                        )}
                      >
                        {option}
                      </button>
                    ) : (
                      <span
                        key={option}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs transition-colors",
                          option === item.value
                            ? "bg-accent text-accent-foreground"
                            : cn(field, "text-muted-foreground"),
                        )}
                      >
                        {option}
                      </span>
                    ),
                  )}
                </div>
              ) : item.kind === "toggle" ? (
                interactive ? (
                  <button
                    type="button"
                    role="switch"
                    aria-labelledby={labelId}
                    aria-checked={item.value === "true"}
                    onClick={() =>
                      onFieldChange(
                        item.name,
                        item.value === "true" ? "false" : "true",
                      )
                    }
                    className="flex w-fit items-center gap-2 rounded-lg outline-none"
                  >
                    <Toggle value={item.value} />
                  </button>
                ) : (
                  <span className="flex items-center gap-2">
                    <Toggle value={item.value} />
                  </span>
                )
              ) : interactive ? (
                <input
                  data-preview-control="input"
                  id={inputId}
                  value={item.value}
                  aria-required={item.required || undefined}
                  onChange={(event) =>
                    onFieldChange(item.name, event.currentTarget.value)
                  }
                  className={cn(
                    field,
                    "text-foreground/80 focus-visible:ring-foreground/20 rounded-lg px-2.5 py-1.5 text-xs outline-none focus-visible:ring-1",
                  )}
                />
              ) : (
                <span
                  className={cn(
                    field,
                    "text-foreground/80 rounded-lg px-2.5 py-1.5 text-xs",
                  )}
                >
                  {item.value}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex min-h-9 flex-wrap items-center justify-end gap-2">
        {state === "request" ? (
          <>
            <Button
              type="button"
              onClick={onDecline}
              variant="outline"
            >
              拒绝
            </Button>
            <Button
              type="button"
              onClick={onAccept}
              disabled={missingRequired}
            >
              发送
            </Button>
          </>
        ) : (
          <span
            key={state}
            ref={receiptRef}
            tabIndex={-1}
            className="fade-in animate-in text-muted-foreground flex items-center gap-2 text-xs duration-300"
          >
            {state === "accepted" ? (
              <>
                <CheckIcon className="size-3.5 text-chart-2" />
                发送至 {server}
              </>
            ) : (
              <>
                <XIcon className="text-muted-foreground size-3.5" />
                已拒绝
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
