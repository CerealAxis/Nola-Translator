import { useState } from 'react'
import { Code2Icon, FileTextIcon, SparklesIcon } from 'lucide-react'
import { TooltipIconButton } from '../../assistant-ui/elements/tooltip-icon-button'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

export default function Demo() {
  const [action, setAction] = useState('')
  return (
    <AssistantPreview>
      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-3">
          <TooltipIconButton tooltip="生成" variant="outline" onClick={() => setAction('已选择生成')}><SparklesIcon /></TooltipIconButton>
          <TooltipIconButton tooltip="查看代码" variant="outline" onClick={() => setAction('已选择查看代码')}><Code2Icon /></TooltipIconButton>
          <TooltipIconButton tooltip="打开文件" variant="outline" onClick={() => setAction('已选择打开文件')}><FileTextIcon /></TooltipIconButton>
        </div>
        <p className="min-h-5 text-sm text-muted-foreground" role="status">{action}</p>
      </div>
    </AssistantPreview>
  )
}
