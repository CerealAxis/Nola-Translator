import { ContextDisplay } from '../../assistant-ui/elements/context-display'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const usage = { totalTokens: 9800, inputTokens: 7200, cachedInputTokens: 1400, outputTokens: 1900, reasoningTokens: 700 }

export default function Demo() {
  return (
    <AssistantPreview>
      <div className="mx-auto flex max-w-md flex-wrap items-center justify-center gap-5">
        <ContextDisplay.Ring modelContextWindow={16000} usage={usage} />
        <ContextDisplay.Bar modelContextWindow={16000} usage={usage} />
        <ContextDisplay.Text modelContextWindow={16000} usage={usage} />
      </div>
    </AssistantPreview>
  )
}
