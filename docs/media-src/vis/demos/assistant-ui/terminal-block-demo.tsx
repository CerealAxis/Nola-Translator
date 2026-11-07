"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shadcn-base/ui/tabs";
import { TerminalBlock } from "../../assistant-ui/elements/terminal-block";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const LINES = [
  "RUN v4.0.5 /apps/docs",
  "✓ 输入框在开关上恢复草稿（12ms）",
  "✓ 输入框发送后清除草稿（9ms）",
  "✓ 输入框保留每个线程的附件（11ms）",
  "测试 3 通过 (3)",
] as const;

const PHASES = [700, 700, 700, 700, 700, 2500] as const;

function TerminalBlockStory({ variant }: { variant: "paper" | "ink" }) {
  const { phase } = useStoryPhases(PHASES);
  const done = phase >= LINES.length;
  const visibleCount = Math.min(phase + 1, LINES.length);

  return (
    <TerminalBlock
      command="pnpm vitest run composer"
      lines={LINES}
      visibleCount={visibleCount}
      done={done}
      variant={variant}
    />
  );
}

export function TerminalBlockDemo() {
  return <TerminalBlockStory variant="paper" />;
}

export function TerminalBlockInkDemo() {
  return <TerminalBlockStory variant="ink" />;
}

export function TerminalBlockFailedDemo() {
  return (
    <TerminalBlock
      cwd="~/assistant-ui"
      command="pnpm build"
      lines={[
        "【1m建筑套餐】【0m",
        "[2m检查入口点 [0m",
      ]}
      stderr={["错误：./runtime 缺少导出"]}
      visibleCount={3}
      done
      exitCode={1}
      durationMs={1200}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <Tabs defaultValue="paper" className="w-full min-w-0">
        <TabsList aria-label="示例变体" className="mx-auto">
          <TabsTrigger value="paper">纸</TabsTrigger>
          <TabsTrigger value="ink">墨色</TabsTrigger>
          <TabsTrigger value="failed">失败</TabsTrigger>
        </TabsList>
        <TabsContent value="paper"><div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><TerminalBlockDemo /></DemoStage></div></TabsContent>
        <TabsContent value="ink"><div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><TerminalBlockInkDemo /></DemoStage></div></TabsContent>
        <TabsContent value="failed"><div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><TerminalBlockFailedDemo /></DemoStage></div></TabsContent>
      </Tabs>
    </AssistantPreview>
  );
}
