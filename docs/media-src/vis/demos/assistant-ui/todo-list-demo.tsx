"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import {
  TodoList,
  type TodoItem,
} from "../../assistant-ui/elements/todo-list";
import { useStoryPhases } from "../../assistant-ui/use-demo";

const REVISIONS: readonly (readonly TodoItem[])[] = [
  [
    {
      id: "read",
      text: "阅读失败的测试",
      description: "梳理转换器目前的行为。",
      status: "active",
    },
    { id: "fix", text: "修复转换器", status: "pending" },
    { id: "scope", text: "更新测试样例", status: "cancelled" },
    { id: "verify", text: "重新运行测试", status: "pending" },
  ],
  [
    {
      id: "read",
      text: "阅读失败的测试",
      description: "梳理转换器目前的行为。",
      status: "done",
    },
    { id: "fix", text: "修复转换器", status: "active" },
    { id: "scope", text: "更新测试样例", status: "cancelled" },
    { id: "verify", text: "重新运行测试", status: "pending" },
  ],
  [
    {
      id: "read",
      text: "阅读失败的测试",
      description: "梳理转换器目前的行为。",
      status: "done",
    },
    { id: "fix", text: "修复转换器", status: "done" },
    { id: "scope", text: "更新测试样例", status: "cancelled" },
    { id: "guard", text: "为无内容片段增加检查", status: "active" },
    { id: "verify", text: "重新运行测试", status: "pending" },
  ],
  [
    {
      id: "read",
      text: "阅读失败的测试",
      description: "梳理转换器目前的行为。",
      status: "done",
    },
    { id: "fix", text: "修复转换器", status: "done" },
    { id: "scope", text: "更新测试样例", status: "cancelled" },
    { id: "guard", text: "为无内容片段增加检查", status: "done" },
    { id: "verify", text: "重新运行测试", status: "done" },
  ],
];

const PHASES = [2000, 2200, 2400, 0] as const;

export function TodoListDemo() {
  const { phase } = useStoryPhases(PHASES);
  const items = REVISIONS[Math.min(phase, REVISIONS.length - 1)]!;

  return <TodoList items={items} revision={Math.min(phase, 3) + 1} />;
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-lg py-6">
        <DemoStage>
          <TodoListDemo />
        </DemoStage>
      </div>
    </AssistantPreview>
  );
}
