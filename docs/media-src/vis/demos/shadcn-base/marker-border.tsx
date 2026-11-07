import { FileTextIcon, GitBranchIcon, SearchIcon } from "lucide-react"

import { Marker, MarkerContent, MarkerIcon } from "@/styles/base-rhea/ui/marker"

export function MarkerBorderDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3 py-12">
      <Marker variant="border">
        <MarkerIcon>
          <GitBranchIcon />
        </MarkerIcon>
        <MarkerContent>已切换到 release-candidate</MarkerContent>
      </Marker>
      <Marker variant="border">
        <MarkerIcon>
          <SearchIcon />
        </MarkerIcon>
        <MarkerContent>已审阅 8 个相关文件</MarkerContent>
      </Marker>
      <Marker variant="border">
        <MarkerIcon>
          <FileTextIcon />
        </MarkerIcon>
        <MarkerContent>已打开实现说明</MarkerContent>
      </Marker>
    </div>
  )
}
