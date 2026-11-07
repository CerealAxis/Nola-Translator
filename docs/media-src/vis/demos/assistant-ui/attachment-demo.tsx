import { Thread } from '../../assistant-ui/elements/thread.aui'
import { DemoRuntime } from '../../assistant-ui/demo-runtime'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

export default function Demo() {
  return (
    <AssistantPreview>
      <DemoRuntime>
        <div className="mx-auto h-96 w-full max-w-lg overflow-hidden rounded-2xl border">
          <Thread autoFocus={false} components={{ Welcome: () => <p className="p-4 text-muted-foreground">选择一张图片，试试添加、预览或移除附件。</p> }} />
        </div>
      </DemoRuntime>
    </AssistantPreview>
  )
}
