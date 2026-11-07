import { useState } from 'react'
import { ReasoningPanel } from '../../assistant-ui/elements/reasoning-panel'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const steps = [
  { title: '核对原文', body: '提取术语、数字和专有名称。' },
  { title: '对照术语表', body: '按文档约定统一关键术语。' },
  { title: '检查语序', body: '调整句子结构，保留原文信息。' },
]

export default function Demo() {
  const [open, setOpen] = useState(true)
  return (
    <AssistantPreview>
      <div className="mx-auto max-w-sm">
        <ReasoningPanel steps={steps} visibleSteps={steps.length} streaming={false} open={open} onOpenChange={setOpen} restingLabel="推理完成" elapsed="6 秒" />
      </div>
    </AssistantPreview>
  )
}
