import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/styles/base-nova/ui/resizable"

export function ResizableVertical() {
  return (
    <ResizablePanelGroup
      orientation="vertical"
      className="min-h-[200px] max-w-sm rounded-lg border"
    >
      <ResizablePanel defaultSize="25%">
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">页眉</span>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize="75%">
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-semibold">内容</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
