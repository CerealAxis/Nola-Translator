"use client";

import { AssistantPreview } from "../../assistant-ui/preview-scope";
import { useEffect, useState } from "react";
import { DraftRestore } from "../../assistant-ui/elements/draft-restore";

export function DraftRestoreDemo() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!dismissed) return;
    const id = setTimeout(() => setDismissed(false), 1800);
    return () => clearTimeout(id);
  }, [dismissed]);

  if (dismissed) return <div className="h-[3.25rem] w-full max-w-sm" />;

  return (
    <DraftRestore
      draft="为切换会话后恢复草稿的功能添加回归测试"
      savedAt="2 分钟前"
      onRestore={() => setDismissed(true)}
      onDiscard={() => setDismissed(true)}
    />
  );
}

export default function Preview() {
  return (
    <AssistantPreview>
      <div className="mx-auto w-full max-w-sm py-6">
        <DraftRestoreDemo />
      </div>
    </AssistantPreview>
  );
}
