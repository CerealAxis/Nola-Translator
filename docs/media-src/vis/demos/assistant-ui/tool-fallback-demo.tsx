import { ToolFallback } from '../../assistant-ui/elements/tool-fallback.aui'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

export default function Demo() {
  return (
    <AssistantPreview>
      <div className="mx-auto max-w-md">
        <ToolFallback.Root defaultOpen>
          <ToolFallback.Trigger toolName="查询术语表" status={{ type: 'complete' }} />
          <ToolFallback.Content>
            <ToolFallback.Args argsText={'{ "术语": "同步口译" }'} />
            <ToolFallback.Result result="在术语表中找到 1 条匹配。" />
          </ToolFallback.Content>
        </ToolFallback.Root>
      </div>
    </AssistantPreview>
  )
}
