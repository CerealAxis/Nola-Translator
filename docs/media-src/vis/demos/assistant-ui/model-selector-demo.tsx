import { ModelSelector } from '../../assistant-ui/elements/model-selector.aui'
import { DemoRuntime } from '../../assistant-ui/demo-runtime'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const models = [
  { id: 'daily', name: '日常对话', description: '示例模型' },
  { id: 'reasoning', name: '深度推理', description: '示例模型' },
  { id: 'vision', name: '图文理解', description: '示例模型' },
]

export default function Demo() {
  return (
    <AssistantPreview>
      <div className="flex justify-center">
        <DemoRuntime><ModelSelector models={models} defaultValue="daily" searchable /></DemoRuntime>
      </div>
    </AssistantPreview>
  )
}
