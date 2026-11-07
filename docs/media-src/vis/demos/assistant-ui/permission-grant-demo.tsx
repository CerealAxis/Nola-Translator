"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { DemoStage } from "../../assistant-ui/demo-stage";
import { useEffect, useState } from "react";
import {
  PermissionGrant,
  type GrantScope,
} from "../../assistant-ui/elements/permission-grant";

const REACH = [
  "工作区下文件读写",
  "运行您已批准的命令",
  "无网络访问",
];

export function PermissionGrantDemo() {
  const [scope, setScope] = useState<GrantScope | "pending">("pending");

  useEffect(() => {
    if (scope === "pending") return;
    const id = setTimeout(() => setScope("pending"), 2600);
    return () => clearTimeout(id);
  }, [scope]);

  return (
    <PermissionGrant
      capability="文件系统访问权限"
      requester="filesystem-mcp"
      reach={REACH}
      scope={scope}
      onGrant={setScope}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="flex min-h-48 w-full min-w-0 items-center justify-center px-3 py-8"><DemoStage replay={false}><PermissionGrantDemo /></DemoStage></div>
    </AssistantPreview>
  );
}
