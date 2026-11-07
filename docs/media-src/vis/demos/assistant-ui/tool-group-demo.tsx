import { ToolFallback } from '../../assistant-ui/elements/tool-fallback.aui'
import { ToolGroupContent, ToolGroupRoot, ToolGroupTrigger } from '../../assistant-ui/elements/tool-group.aui'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const tools = [
  { name: '查询术语表', result: '找到 3 条术语。' },
  { name: '校对译文', result: '发现 1 处术语不一致。' },
  { name: '生成报告', result: '已生成校对摘要。' },
]

export default function Demo() {
  return (
    <AssistantPreview>
      <div className="mx-auto max-w-md">
        <ToolGroupRoot variant="outline">
          <ToolGroupTrigger count={tools.length} />
          <ToolGroupContent>
            {tools.map(tool => (
              <ToolFallback.Root key={tool.name}>
                <ToolFallback.Trigger toolName={tool.name} status={{ type: 'complete' }} />
                <ToolFallback.Content>
                  <ToolFallback.Result result={tool.result} />
                </ToolFallback.Content>
              </ToolFallback.Root>
            ))}
          </ToolGroupContent>
        </ToolGroupRoot>
      </div>
    </AssistantPreview>
  )
}
