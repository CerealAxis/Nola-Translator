import { SyntaxHighlighter } from '../../assistant-ui/elements/syntax-highlighter'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const code = 'export function greet(name: string) {\n  return "你好，" + name\n}'
const components = {
  Pre: ({ node: _, ...props }: React.ComponentProps<'pre'> & { node?: unknown }) => <pre {...props} />,
  Code: ({ node: _, ...props }: React.ComponentProps<'code'> & { node?: unknown }) => <code {...props} />,
}

export default function Demo() {
  return (
    <AssistantPreview>
      <div className="mx-auto max-w-xl overflow-auto rounded-lg bg-card p-3 text-sm text-card-foreground">
        <SyntaxHighlighter language="typescript" code={code} components={components} />
      </div>
    </AssistantPreview>
  )
}
