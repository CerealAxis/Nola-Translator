import { GitBranchIcon, SearchIcon } from "lucide-react"

import { Marker, MarkerContent, MarkerIcon } from "@/styles/base-rhea/ui/marker"
import { Spinner } from "@/styles/base-rhea/ui/spinner"

export function MarkerDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8 py-12">
      <Marker>
        <MarkerIcon>
          <GitBranchIcon />
        </MarkerIcon>
        <MarkerContent>已切换到新分支</MarkerContent>
      </Marker>
      <Marker role="status">
        <MarkerIcon>
          <Spinner />
        </MarkerIcon>
        <MarkerContent className="shimmer">正在思考……</MarkerContent>
      </Marker>
      <Marker variant="separator">
        <MarkerContent>对话已整理</MarkerContent>
      </Marker>
      <Marker>
        <MarkerIcon>
          <SearchIcon />
        </MarkerIcon>
        <MarkerContent>已检查 4 个文件</MarkerContent>
      </Marker>
    </div>
  )
}
