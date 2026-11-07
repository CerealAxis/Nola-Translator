"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shadcn-base/ui/tabs";
import { TypingIndicator } from "../../assistant-ui/elements/typing-indicator";

export function TypingIndicatorDemo() {
  return <TypingIndicator variant="bubble" />;
}

export function TypingIndicatorBareDemo() {
  return <TypingIndicator variant="bare" />;
}

export default function Preview() {
  return (
    <AssistantPreview>
      <Tabs defaultValue="bubble" className="w-full min-w-0">
        <TabsList aria-label="示例变体" className="mx-auto">
          <TabsTrigger value="bubble">气泡</TabsTrigger>
          <TabsTrigger value="bare">仅圆点</TabsTrigger>
        </TabsList>
        <TabsContent value="bubble"><div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><TypingIndicatorDemo /></DemoStage></div></TabsContent>
        <TabsContent value="bare"><div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><TypingIndicatorBareDemo /></DemoStage></div></TabsContent>
      </Tabs>
    </AssistantPreview>
  );
}
