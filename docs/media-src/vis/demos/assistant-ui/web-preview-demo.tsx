"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { WebPreview } from "../../assistant-ui/elements/web-preview";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const PHASES = [1500, 0] as const;

export function WebPreviewDemo() {
  const { phase } = useStoryPhases(PHASES);

  return (
    <WebPreview origin="scf.auiusercontent.com" loading={phase === 0}>
      <div className="flex flex-col gap-3 p-5">
        <span className="text-[15px] font-medium tracking-tight">
          季度总结
        </span>
        <span className="text-foreground/55 text-xs leading-relaxed">
          替身内容。该元素仅绘制铬；在真正的应用程序中你
          传递一个沙盒框架作为其子框架，该框架就是隔离的
          来自此页面的模型编写的标记。
        </span>
        <div className="flex gap-1.5">
          {[62, 38, 84, 51].map((height, i) => (
            <span
              key={i}
              className="w-6 rounded-t bg-blue-500/70 dark:bg-blue-400/70"
              style={{ height: `${height * 0.4}px` }}
            />
          ))}
        </div>
      </div>
    </WebPreview>
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><WebPreviewDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
