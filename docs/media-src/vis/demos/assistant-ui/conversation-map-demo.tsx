import { useState } from 'react'
import { ConversationMap } from '../../assistant-ui/elements/conversation-map'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const entries = [
  { id: 'one', title: '讨论术语', preview: '整理本轮需要统一的术语。' },
  { id: 'two', title: '检查译文', preview: '核对译文中的数字与单位。' },
  { id: 'three', title: '汇总建议', preview: '把校对结果写成可执行的建议。' },
  { id: 'four', title: '生成报告', preview: '整理校对结论和未完成事项。' },
]

export default function Demo() {
  const [activeId, setActiveId] = useState(entries[0].id)
  return (
    <AssistantPreview>
      <div className="mx-auto flex max-w-md items-center justify-between gap-4 rounded-2xl border p-4">
        <p>{entries.find(entry => entry.id === activeId)?.preview}</p>
        <ConversationMap entries={entries} activeId={activeId} visibleIds={[activeId]} onSelect={setActiveId} />
      </div>
    </AssistantPreview>
  )
}
