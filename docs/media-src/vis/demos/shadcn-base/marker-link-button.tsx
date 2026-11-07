"use client"

import { GitBranchIcon, RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"

import { Marker, MarkerContent, MarkerIcon } from "@/styles/base-rhea/ui/marker"

export function MarkerLinkButtonDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8 py-12">
      <Marker render={<a href="#links-and-buttons" />}>
        <MarkerIcon>
          <GitBranchIcon />
        </MarkerIcon>
        <MarkerContent>查看拉取请求</MarkerContent>
      </Marker>
      <Marker
        render={
          <button
            type="button"
            className="transition-colors hover:text-foreground"
            onClick={() => toast("你点击了“撤销”按钮")}
          />
        }
      >
        <MarkerIcon>
          <RotateCcwIcon />
        </MarkerIcon>
        <MarkerContent>撤销此更改</MarkerContent>
      </Marker>
    </div>
  )
}
