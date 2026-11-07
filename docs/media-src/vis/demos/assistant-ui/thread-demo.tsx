import { DemoRuntime } from '../../assistant-ui/demo-runtime'
import { Thread } from '../../assistant-ui/elements/thread.aui'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

export default function ThreadDemo() {
  return (
    <AssistantPreview>
      <DemoRuntime>
        <div className="mx-auto h-112 w-full max-w-2xl overflow-hidden rounded-2xl border">
          <Thread autoFocus={false} />
        </div>
      </DemoRuntime>
    </AssistantPreview>
  )
}
