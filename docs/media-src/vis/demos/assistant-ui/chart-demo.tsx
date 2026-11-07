"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shadcn-base/ui/tabs";
import { Chart } from "../../assistant-ui/elements/chart";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const POINTS = [
  18, 22, 19, 31, 28, 42, 38, 51, 47, 63, 58, 71, 69, 84, 92,
] as const;

const PHASES = [
  180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 0,
] as const;

function useStreamedPoints() {
  const { phase } = useStoryPhases(PHASES);
  return Math.min(phase + 1, POINTS.length);
}

export function ChartDemo() {
  const visibleCount = useStreamedPoints();
  return (
    <Chart
      label="本周运行"
      value="92"
      delta="+34%"
      points={POINTS}
      visibleCount={visibleCount}
      variant="area"
    />
  );
}

export function ChartLineDemo() {
  const visibleCount = useStreamedPoints();
  return (
    <Chart
      label="p95 延迟"
      value="1.2s"
      delta="−18%"
      points={POINTS}
      visibleCount={visibleCount}
      variant="line"
    />
  );
}

export function ChartBarsDemo() {
  const visibleCount = useStreamedPoints();
  return (
    <Chart
      label="每次运行的令牌"
      value="4.1k"
      delta="+9%"
      points={POINTS}
      visibleCount={visibleCount}
      variant="bars"
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <Tabs defaultValue="area" className="w-full min-w-0">
        <TabsList aria-label="示例变体" className="mx-auto">
          <TabsTrigger value="area">面积图</TabsTrigger>
          <TabsTrigger value="line">折线图</TabsTrigger>
          <TabsTrigger value="bars">柱状图</TabsTrigger>
        </TabsList>
        <TabsContent value="area"><div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><ChartDemo /></DemoStage></div></TabsContent>
        <TabsContent value="line"><div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><ChartLineDemo /></DemoStage></div></TabsContent>
        <TabsContent value="bars"><div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><ChartBarsDemo /></DemoStage></div></TabsContent>
      </Tabs>
    </AssistantPreview>
  );
}
