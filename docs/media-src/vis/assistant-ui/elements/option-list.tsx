"use client";

import { useCallback, useState, type ComponentProps } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { Button } from "../../shadcn-base/ui/button";
import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";
import { clamp } from "../utils/range";
import { useReceiptFocus } from "./receipt-focus";

export interface OptionListOption {
  id: string;
  label: string;
  description?: string | undefined;
  disabled?: boolean | undefined;
}

export interface OptionListProps extends Omit<
  ComponentProps<"div">,
  "children" | "defaultValue" | "onChange"
> {
  options: readonly OptionListOption[];
  /** One option answers the question, or several do. */
  selectionMode?: "single" | "multiple" | undefined;
  /**
   * Options the list starts selected: checked in a multiple selection, and
   * marked as the current answer in a single one.
   */
  defaultValue?: readonly string[] | undefined;
  /** The fewest options a multiple selection confirms with. */
  minSelections?: number | undefined;
  /** The most options a multiple selection may hold. */
  maxSelections?: number | undefined;
  /**
   * Commits the answer: a single selection commits on pick, a multiple one on
   * the confirm button. Without it the list only displays its options. A
   * rejected promise reopens the list, because the answer never landed.
   */
  onConfirm?: ((ids: string[]) => void | Promise<void>) | undefined;
  confirmLabel?: string | undefined;
  /**
   * The committed answer. Once set, the list is a receipt of just these
   * options and takes no further input.
   */
  choice?: readonly string[] | undefined;
}

const row =
  "flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-start transition-colors outline-none focus-visible:ring-1 focus-visible:ring-foreground/20";

function OptionText({ option }: { option: OptionListOption }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[13.5px] leading-5 break-words">
        {option.label}
      </span>
      {option.description ? (
        <span className="text-muted-foreground text-xs leading-4 break-words">
          {option.description}
        </span>
      ) : null}
    </span>
  );
}

export function OptionList({
  options,
  selectionMode = "single",
  defaultValue,
  minSelections = 1,
  maxSelections,
  onConfirm,
  confirmLabel = "Confirm",
  choice,
  className,
  ...props
}: OptionListProps) {
  const multiple = selectionMode === "multiple";
  const [selected, setSelected] = useState<readonly string[]>(() =>
    (defaultValue ?? []).filter((id) => options.some((o) => o.id === id)),
  );
  const [pending, setPending] = useState<readonly string[] | null>(null);
  const [confirmed, setConfirmed] = useState<readonly string[] | undefined>();
  const [error, setError] = useState<string | null>(null);
  const { receiptRef, focusHandlers } = useReceiptFocus<HTMLDivElement>(props);
  const setReceiptRef = useCallback(
    (node: HTMLDivElement | null) => {
      receiptRef.current = node;
      const { ref } = props;
      if (typeof ref === "function") return ref(node);
      if (ref && typeof ref === "object")
        (ref as { current: HTMLDivElement | null }).current = node;
      return undefined;
    },
    [props.ref, receiptRef],
  );

  const root = cn(
    paper,
    "flex w-full max-w-sm flex-col gap-1 rounded-2xl p-2",
    className,
  );

  const confirmedChoice = choice ?? confirmed;

  if (confirmedChoice !== undefined) {
    const chosen = options.filter((option) =>
      confirmedChoice.includes(option.id),
    );
    return (
      <div
        data-slot="option-list"
        data-state="receipt"
        className={root}
        {...props}
        {...focusHandlers}
        ref={setReceiptRef}
        tabIndex={-1}
      >
        {chosen.length === 0 ? (
          <span className={cn(mono, "text-muted-foreground px-2 py-2")}>
            未选择
          </span>
        ) : (
          chosen.map((option) => (
            <div key={option.id} className={cn(row, "text-foreground/70")}>
              <span className="flex h-5 w-3.5 shrink-0 items-center justify-center">
                <CheckIcon
                  aria-hidden
                  className="text-muted-foreground size-3.5"
                />
                <span className="sr-only">已选:</span>
              </span>
              <OptionText option={option} />
            </div>
          ))
        )}
      </div>
    );
  }

  if (!onConfirm) {
    return (
      <div
        data-slot="option-list"
        className={root}
        {...props}
        {...focusHandlers}
      >
        {options.map((option) => (
          <div
            key={option.id}
            className={cn(row, option.disabled && "text-muted-foreground")}
          >
            <OptionText option={option} />
          </div>
        ))}
      </div>
    );
  }

  const locked = pending !== null;
  const max = Math.floor(
    clamp(maxSelections ?? options.length, 0, options.length),
  );
  const min = Math.floor(clamp(minSelections, 0, max));
  const optionIds = new Set(options.map((option) => option.id));
  const selectedIds = selected.filter((id) => optionIds.has(id));

  const commit = (ids: string[]) => {
    if (locked) return;
    setPending(ids);
    setError(null);
    void (async () => {
      try {
        await onConfirm(ids);
        setConfirmed(ids);
      } catch (commitError) {
        setPending(null);
        setError(
          commitError instanceof Error
            ? commitError.message
            : String(commitError),
        );
      }
    })();
  };

  const toggle = (id: string) => {
    if (locked) return;
    setSelected((current) => {
      const available = current.filter((value) => optionIds.has(value));
      return available.includes(id)
        ? available.filter((value) => value !== id)
        : available.length < max
          ? [...available, id]
          : available;
    });
  };

  const count = selectedIds.length;
  const canConfirm = !locked && count >= min && count <= max;

  return (
    <div
      role="group"
      data-slot="option-list"
      data-state={locked ? "pending" : "open"}
      aria-busy={locked || undefined}
      className={root}
      {...props}
      {...focusHandlers}
    >
      {options.map((option) => {
        const isSelected = multiple
          ? selectedIds.includes(option.id)
          : (pending ?? selected).includes(option.id);
        const unavailable =
          option.disabled === true || (multiple && !isSelected && count >= max);
        const className = cn(
          row,
          isSelected
            ? "bg-accent"
            : !unavailable && !locked && "hover:bg-accent hover:text-accent-foreground",
          unavailable && "text-muted-foreground",
          !unavailable && (isSelected ? "text-accent-foreground" : "text-foreground/90"),
          (unavailable || locked) && "cursor-default",
        );
        return (
          <button
            key={option.id}
            type="button"
            {...(multiple
              ? { role: "checkbox", "aria-checked": isSelected }
              : {})}
            aria-disabled={unavailable || locked || undefined}
            disabled={option.disabled}
            onClick={() => {
              if (unavailable) return;
              if (multiple) toggle(option.id);
              else commit([option.id]);
            }}
            className={className}
          >
            {multiple ? (
              <span
                aria-hidden
                className="flex h-5 w-4 shrink-0 items-center justify-center"
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-[6px] border",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input dark:bg-input/30",
                  )}
                >
                  {isSelected ? <CheckIcon className="size-3.5" /> : null}
                </span>
              </span>
            ) : pending?.includes(option.id) ? (
              <span
                aria-hidden
                className="flex h-5 w-3.5 shrink-0 items-center justify-center"
              >
                <Loader2Icon className="text-muted-foreground size-3.5 animate-spin motion-reduce:animate-none" />
              </span>
            ) : null}
            <OptionText option={option} />
          </button>
        );
      })}
      {error ? (
        <p
          role="alert"
          className="px-2 pb-1 text-xs break-words text-destructive"
        >
          {error}
        </p>
      ) : null}
      {multiple ? (
        <div className="flex items-center justify-between gap-3 px-2 pt-1.5 pb-1">
          <span className={cn(mono, "text-muted-foreground tabular-nums")}>
            {count} 的 {max}
          </span>
          <Button
            type="button"
            aria-disabled={!canConfirm || undefined}
            onClick={() => {
              if (!canConfirm) return;
              commit(
                options
                  .filter((option) => selectedIds.includes(option.id))
                  .map((option) => option.id),
              );
            }}
            className="aria-disabled:opacity-50"
          >
            {locked ? (
              <Loader2Icon
                aria-hidden
                className="size-3.5 animate-spin motion-reduce:animate-none"
              />
            ) : null}
            {confirmLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
