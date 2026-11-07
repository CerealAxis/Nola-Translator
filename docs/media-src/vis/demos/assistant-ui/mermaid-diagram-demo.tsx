import { MermaidDiagram } from '../../assistant-ui/elements/mermaid-diagram'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const code = 'flowchart LR\n  A["导入原文"] --> B["生成译文"]\n  B --> C["人工校对"]\n  C --> D["导出结果"]'

export default function Demo() {
  return (
    <AssistantPreview>
      <div className="mx-auto max-w-xl">
        <MermaidDiagram code={code} />
      </div>
    </AssistantPreview>
  )
}
