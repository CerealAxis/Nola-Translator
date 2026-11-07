import { ThreadListSidebar } from '../../assistant-ui/elements/threadlist-sidebar.aui'
import { Thread } from '../../assistant-ui/elements/thread.aui'
import { DemoThreadListRuntime } from '../../assistant-ui/demo-runtime'
import { AssistantPreview } from '../../assistant-ui/preview-scope'
import { SidebarProvider } from '../../shadcn-base/ui/sidebar'

export default function Demo() {
  return (
    <AssistantPreview>
      <DemoThreadListRuntime>
        <SidebarProvider className="h-112 min-h-0 overflow-hidden rounded-2xl border [--sidebar-width:40%]">
          <ThreadListSidebar collapsible="none" />
          <main className="min-w-0 flex-1 overflow-hidden">
            <Thread autoFocus={false} />
          </main>
        </SidebarProvider>
      </DemoThreadListRuntime>
    </AssistantPreview>
  )
}
