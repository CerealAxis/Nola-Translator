"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../shadcn-base/ui/tabs";
import { useEffect, useState } from "react";
import {
  OptionList,
  type OptionListOption,
} from "../../assistant-ui/elements/option-list";

const DUPLICATES: readonly OptionListOption[] = [
  {
    id: "merge",
    label: "合并重复联系人",
    description: "将每对重复项合并，保留所有字段。",
  },
  {
    id: "keep",
    label: "全部保留",
    description: "将每对联系人保留为两条记录。",
  },
  {
    id: "review",
    label: "逐对审阅",
    description: "依次检查这 12 对联系人。",
  },
];

const CHECKS: readonly OptionListOption[] = [
  { id: "typecheck", label: "类型检查" },
  { id: "unit", label: "单元测试", description: "约 40 秒。" },
  { id: "e2e", label: "端到端测试", description: "约 6 分钟。" },
  { id: "lint", label: "代码检查" },
];

function useReceiptLoop() {
  const [choice, setChoice] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    if (choice === undefined) return;
    const id = setTimeout(() => setChoice(undefined), 2600);
    return () => clearTimeout(id);
  }, [choice]);

  const confirm = (ids: string[]) =>
    new Promise<void>((resolve) =>
      setTimeout(() => {
        setChoice(ids);
        resolve();
      }, 700),
    );

  return { choice, confirm };
}

export function OptionListDemo() {
  const { choice, confirm } = useReceiptLoop();

  return (
    <OptionList
      key={choice === undefined ? "open" : "receipt"}
      aria-label="如何处理重复联系人？"
      options={DUPLICATES}
      choice={choice}
      onConfirm={confirm}
    />
  );
}

export function OptionListMultipleDemo() {
  const { choice, confirm } = useReceiptLoop();

  return (
    <OptionList
      key={choice === undefined ? "open" : "receipt"}
      aria-label="部署前应运行哪些检查？"
      options={CHECKS}
      selectionMode="multiple"
      defaultValue={["typecheck", "unit"]}
      maxSelections={3}
      choice={choice}
      onConfirm={confirm}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <Tabs defaultValue="single" className="w-full">
          <TabsList>
            <TabsTrigger value="single">单选</TabsTrigger>
            <TabsTrigger value="multiple">多选</TabsTrigger>
          </TabsList>
          <TabsContent value="single" className="pt-4"><OptionListDemo /></TabsContent>
          <TabsContent value="multiple" className="pt-4"><OptionListMultipleDemo /></TabsContent>
        </Tabs>
      </div>
    </AssistantPreview>
  );
}
