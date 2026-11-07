"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shadcn-base/ui/tabs";
import { MessagePair } from "../../assistant-ui/elements/message-pair";
import { useWordStream } from "../../assistant-ui/use-demo";

const USER_MESSAGE = "如何在切换会话时保留输入框里的草稿？";
const ASSISTANT_MESSAGE =
  "在运行时按会话 ID 保存草稿。切回会话时，把草稿恢复到输入框，消息发送后再删除草稿。";

function MessagePairStory({ variant }: { variant: "bubble" | "flat" }) {
  const { words, count, streaming, restart } = useWordStream(
    ASSISTANT_MESSAGE,
    {
      interval: 82,
    },
  );

  return (
    <MessagePair
      userMessage={USER_MESSAGE}
      words={words}
      wordSeparator=""
      visibleWords={count}
      streaming={streaming}
      variant={variant}
      onCopy={() => void navigator.clipboard?.writeText(ASSISTANT_MESSAGE)}
      onRegenerate={restart}
    />
  );
}

export function MessagePairDemo() {
  return <MessagePairStory variant="bubble" />;
}

export function MessagePairFlatDemo() {
  return <MessagePairStory variant="flat" />;
}

export default function Preview() {
  return (
    <AssistantPreview>
      <Tabs defaultValue="bubble" className="w-full min-w-0">
        <TabsList aria-label="示例变体" className="mx-auto">
          <TabsTrigger value="bubble">气泡</TabsTrigger>
          <TabsTrigger value="flat">平铺</TabsTrigger>
        </TabsList>
        <TabsContent value="bubble"><div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><MessagePairDemo /></DemoStage></div></TabsContent>
        <TabsContent value="flat"><div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage><MessagePairFlatDemo /></DemoStage></div></TabsContent>
      </Tabs>
    </AssistantPreview>
  );
}
