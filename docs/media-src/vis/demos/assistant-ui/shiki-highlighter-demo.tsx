import { SyntaxHighlighter } from '../../assistant-ui/elements/shiki-highlighter'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const code = 'const checklist = ["核对术语", "确认数字", "通读译文"]\nfor (const item of checklist) {\n  console.log(item)\n}'

export default function Demo() {
  return (
    <AssistantPreview>
      <div className="mx-auto max-w-xl overflow-auto rounded-lg border">
        <div className="border-b bg-muted px-3 py-2 text-xs text-muted-foreground">TypeScript</div>
        <SyntaxHighlighter language="typescript" code={code} highlightLines={[2]} />
      </div>
    </AssistantPreview>
  )
}
