import { Marker, MarkerContent } from "@/styles/base-rhea/ui/marker"

export function MarkerSeparatorDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8 py-12">
      <Marker variant="separator">
        <MarkerContent>今天</MarkerContent>
      </Marker>
      <Marker variant="separator">
        <MarkerContent>耗时 42 秒</MarkerContent>
      </Marker>
      <Marker variant="separator">
        <MarkerContent>对话已整理</MarkerContent>
      </Marker>
    </div>
  )
}
