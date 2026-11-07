import { DemoThreadListRuntime } from '../../assistant-ui/demo-runtime'
import { AssistantModal } from '../../assistant-ui/elements/assistant-modal.aui'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

export default function AssistantModalDemo() {
  return (
    <AssistantPreview>
      <DemoThreadListRuntime>
        <div className="relative mx-auto h-128 w-full max-w-2xl">
          <AssistantModal />
        </div>
      </DemoThreadListRuntime>
    </AssistantPreview>
  )
}
