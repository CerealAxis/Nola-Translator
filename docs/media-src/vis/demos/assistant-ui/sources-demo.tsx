import { useState } from 'react'
import { Sources } from '../../assistant-ui/elements/sources'
import { AssistantPreview } from '../../assistant-ui/preview-scope'
import { Button } from '../../shadcn-base/ui/button'

const sources = [
  { title: '对话组件使用指南', domain: 'assistant-ui.com', url: 'https://www.assistant-ui.com/docs/installation', snippet: '包含组件安装、运行时设置及示例。' },
  { title: 'React 文档', domain: 'react.dev', url: 'https://react.dev/learn', snippet: '说明如何组合组件并管理界面状态。' },
]

export default function Demo() {
  const [open, setOpen] = useState(true)
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  return (
    <AssistantPreview>
      <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>网格</Button>
          <Button size="sm" variant="outline" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>列表</Button>
        </div>
        <Sources sources={sources} open={open} onOpenChange={setOpen} layout={layout} locale="zh-CN" />
      </div>
    </AssistantPreview>
  )
}
