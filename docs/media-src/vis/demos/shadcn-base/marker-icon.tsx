import { BookOpenCheck, GitBranchIcon, SearchIcon } from "lucide-react"

import { Marker, MarkerContent, MarkerIcon } from "@/styles/base-rhea/ui/marker"

export function MarkerIconDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-12 py-12">
      <Marker>
        <MarkerIcon>
          <GitBranchIcon />
        </MarkerIcon>
        <MarkerContent>已切换到新分支</MarkerContent>
      </Marker>
      <Marker variant="separator">
        <MarkerIcon>
          <SearchIcon />
        </MarkerIcon>
        <MarkerContent>已检查 4 个文件</MarkerContent>
      </Marker>
      <Marker className="flex-col">
        <MarkerIcon>
          <BookOpenCheck />
        </MarkerIcon>
        <MarkerContent>同步已完成</MarkerContent>
      </Marker>
    </div>
  )
}
