import { AssistantSidebar } from '../../assistant-ui/elements/assistant-sidebar.aui'
import { DemoRuntime } from '../../assistant-ui/demo-runtime'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

export default function Demo() {
  return (
    <AssistantPreview>
      <div className="h-112 min-w-0 overflow-hidden rounded-2xl border">
        <DemoRuntime>
          <AssistantSidebar>
            <div className="grid h-full place-items-center p-3 text-center">
              <div>
                <p className="font-medium">工作区</p>
                <p className="text-sm text-muted-foreground">拖动分隔线可以调整助手侧栏。</p>
              </div>
            </div>
          </AssistantSidebar>
        </DemoRuntime>
      </div>
    </AssistantPreview>
  )
}
