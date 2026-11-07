"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../shadcn-base/ui/tabs";
import { useEffect, useState } from "react";
import { Trash2Icon } from "lucide-react";
import {
  ApprovalCard,
  type ApprovalState,
} from "../../assistant-ui/elements/approval-card";

export function ApprovalCardDemo() {
  const [state, setState] = useState<ApprovalState>("request");

  useEffect(() => {
    if (state === "request") return;
    const delay = state === "running" ? 1800 : state === "done" ? 2400 : 1600;
    const id = setTimeout(() => {
      setState(state === "running" ? "done" : "request");
    }, delay);
    return () => clearTimeout(id);
  }, [state]);

  return (
    <ApprovalCard
      state={state}
      command="pnpm vitest run --changed"
      title="运行命令"
      subtitle="代理希望执行一条 Shell 命令"
      onAllowOnce={() => setState("running")}
      onAlwaysAllow={() => setState("running")}
      onDeny={() => setState("denied")}
    />
  );
}

export function ApprovalCardDestructiveDemo() {
  const [state, setState] = useState<ApprovalState>("request");

  useEffect(() => {
    if (state === "request") return;
    const delay = state === "running" ? 1800 : state === "done" ? 2400 : 1600;
    const id = setTimeout(() => {
      setState(state === "running" ? "done" : "request");
    }, delay);
    return () => clearTimeout(id);
  }, [state]);

  return (
    <ApprovalCard
      state={state}
      variant="destructive"
      icon={<Trash2Icon className="size-4" />}
      title="删除 12 个已归档会话"
      subtitle="此操作无法撤销"
      description="所选会话及其生成的文件将被永久删除。"
      details={[
        { label: "会话", value: "12 archived" },
        { label: "生成的文件", value: "38 files" },
      ]}
      allowOnceLabel="删除会话"
      denyLabel="保留会话"
      onAllowOnce={() => setState("running")}
      onDeny={() => setState("denied")}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <Tabs defaultValue="command" className="w-full">
          <TabsList>
            <TabsTrigger value="command">运行命令</TabsTrigger>
            <TabsTrigger value="destructive">删除会话</TabsTrigger>
          </TabsList>
          <TabsContent value="command" className="pt-4"><ApprovalCardDemo /></TabsContent>
          <TabsContent value="destructive" className="pt-4"><ApprovalCardDestructiveDemo /></TabsContent>
        </Tabs>
      </div>
    </AssistantPreview>
  );
}
