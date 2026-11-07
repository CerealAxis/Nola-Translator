"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shadcn-base/ui/tabs";
import { LinkPreview } from "../../assistant-ui/elements/link-preview";

export function LinkPreviewDemo() {
  return (
    <LinkPreview
      href="https://github.com/langchain-ai/open-canvas"
      title="Open Canvas"
      description="ChatGPT Canvas 的 OSS 实现。"
      image="/screenshot/open-canvas.png"
      imageAlt="Open Canvas 将文档编辑器和聊天并排显示"
      siteName="GitHub"
    />
  );
}

export function LinkPreviewCompactDemo() {
  return (
    <LinkPreview
      href="https://www.assistant-ui.com/examples/ai-sdk"
      title="AI SDK"
      description="AI SDK 聊天持久化。"
      image="/screenshot/examples/ai-sdk.png"
      imageAlt="AI SDK 聊天示例"
      siteName="assistant-ui"
      favicon="/favicon/icon.svg"
      layout="compact"
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <Tabs defaultValue="card" className="w-full min-w-0">
        <TabsList aria-label="示例变体" className="mx-auto">
          <TabsTrigger value="card">卡</TabsTrigger>
          <TabsTrigger value="compact">紧凑</TabsTrigger>
        </TabsList>
        <TabsContent value="card"><div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><LinkPreviewDemo /></DemoStage></div></TabsContent>
        <TabsContent value="compact"><div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><LinkPreviewCompactDemo /></DemoStage></div></TabsContent>
      </Tabs>
    </AssistantPreview>
  );
}
