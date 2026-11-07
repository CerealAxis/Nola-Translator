import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/styles/base-nova/ui/context-menu"

export function ContextMenuSides() {
  return (
    <div className="grid w-full max-w-sm grid-cols-2 gap-4">
      <ContextMenu>
        <ContextMenuTrigger className="flex aspect-video w-full max-w-xs items-center justify-center rounded-xl border border-dashed text-sm">
          <span className="hidden pointer-fine:inline-block">
            右键点击（顶部）
          </span>
          <span className="hidden pointer-coarse:inline-block">
            长按（顶部）
          </span>
        </ContextMenuTrigger>
        <ContextMenuContent side="top">
          <ContextMenuGroup>
            <ContextMenuItem>返回</ContextMenuItem>
            <ContextMenuItem>前进</ContextMenuItem>
            <ContextMenuItem>重新加载</ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      <ContextMenu>
        <ContextMenuTrigger className="flex aspect-video w-full max-w-xs items-center justify-center rounded-xl border border-dashed text-sm">
          <span className="hidden pointer-fine:inline-block">
            右键点击（右侧）
          </span>
          <span className="hidden pointer-coarse:inline-block">
            长按（右侧）
          </span>
        </ContextMenuTrigger>
        <ContextMenuContent side="right">
          <ContextMenuGroup>
            <ContextMenuItem>返回</ContextMenuItem>
            <ContextMenuItem>前进</ContextMenuItem>
            <ContextMenuItem>重新加载</ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      <ContextMenu>
        <ContextMenuTrigger className="flex aspect-video w-full max-w-xs items-center justify-center rounded-xl border border-dashed text-sm">
          <span className="hidden pointer-fine:inline-block">
            右键点击（底部）
          </span>
          <span className="hidden pointer-coarse:inline-block">
            长按（底部）
          </span>
        </ContextMenuTrigger>
        <ContextMenuContent side="bottom">
          <ContextMenuGroup>
            <ContextMenuItem>返回</ContextMenuItem>
            <ContextMenuItem>前进</ContextMenuItem>
            <ContextMenuItem>重新加载</ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      <ContextMenu>
        <ContextMenuTrigger className="flex aspect-video w-full max-w-xs items-center justify-center rounded-xl border border-dashed text-sm">
          <span className="hidden pointer-fine:inline-block">
            右键点击（左侧）
          </span>
          <span className="hidden pointer-coarse:inline-block">
            长按（左侧）
          </span>
        </ContextMenuTrigger>
        <ContextMenuContent side="left">
          <ContextMenuGroup>
            <ContextMenuItem>返回</ContextMenuItem>
            <ContextMenuItem>前进</ContextMenuItem>
            <ContextMenuItem>重新加载</ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  )
}
