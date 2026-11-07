"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRow,
} from "../../assistant-ui/elements/data-table";

const COLUMNS = [
  { key: "name", label: "型号", priority: "primary", width: "34%" },
  {
    key: "context",
    label: "背景信息",
    format: { kind: "number", compact: true },
    width: "18%",
  },
  {
    key: "input",
    label: "输入",
    format: { kind: "currency", currency: "USD", decimals: 2 },
    width: "18%",
  },
  {
    key: "latency",
    label: "延迟",
    format: { kind: "number", unit: "女士" },
    width: "15%",
  },
  {
    key: "weekly",
    label: "周刊",
    format: { kind: "delta", decimals: 1, unit: "%" },
    width: "15%",
  },
] as const satisfies readonly DataTableColumn[];

const REFERENCE_TIME = Date.parse("2026-09-26T12:00:00Z");

const MODELS = [
  {
    name: "十四行诗4.5",
    context: 200_000,
    input: 3,
    latency: 820,
    weekly: 2.4,
  },
  { name: "GPT-5", context: 400_000, input: 5, latency: 690, weekly: -1.2 },
  {
    name: "俳句 4.5",
    context: 200_000,
    input: 0.8,
    latency: 420,
    weekly: 4.8,
  },
] as const satisfies readonly DataTableRow[];

export function DataTableDemo() {
  return (
    <DataTable
      columns={COLUMNS}
      rows={MODELS}
      rowKey="name"
      defaultSort={{ key: "context", direction: "desc" }}
      caption="型号对比"
      relativeTo={REFERENCE_TIME}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><DataTableDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
