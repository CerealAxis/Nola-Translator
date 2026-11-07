"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useState } from "react";
import { Diagram } from "../../assistant-ui/elements/diagram";

const BOXES = [
  { label: "输入框", x: 8, y: 10 },
  { label: "运行时", x: 108, y: 10 },
  { label: "适配器", x: 208, y: 10 },
  { label: "提供商", x: 158, y: 74 },
];

export function DiagramDemo() {
  const [zoom, setZoom] = useState(1);

  return (
    <Diagram
      title="消息流"
      zoom={zoom}
      onZoomIn={() => setZoom((z) => Math.min(1.6, z + 0.2))}
      onZoomOut={() => setZoom((z) => Math.max(0.6, z - 0.2))}
      onReset={() => setZoom(1)}
      onExpand={() => setZoom(1.6)}
    >
      <svg viewBox="0 0 292 116" className="h-[116px] w-[292px]">
        <path
          d="M 88 26 L 108 26 M 188 26 L 208 26 M 248 42 L 248 74 L 218 90"
          className="stroke-foreground/25"
          strokeWidth="1.5"
          fill="none"
        />
        {BOXES.map((box) => (
          <g key={box.label}>
            <rect
              x={box.x}
              y={box.y}
              width="80"
              height="32"
              rx="8"
              className="fill-foreground/[0.05] stroke-foreground/15"
              strokeWidth="1"
            />
            <text
              x={box.x + 40}
              y={box.y + 20}
              textAnchor="middle"
              className="fill-foreground/70 font-mono text-[10px]"
            >
              {box.label}
            </text>
          </g>
        ))}
      </svg>
    </Diagram>
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><DiagramDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
