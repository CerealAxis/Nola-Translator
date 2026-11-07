import { FileTextIcon, SearchIcon, TerminalIcon } from "lucide-react"

import {
  Trace,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/styles/base-rhea/ui/trace"

export function TraceGroupDemo() {
  return (
    <Trace className="max-w-sm">
      <TraceLine>
        <TraceIcon>
          <SearchIcon />
        </TraceIcon>
        <TraceTitle>已搜索 minimumReleaseAge</TraceTitle>
      </TraceLine>
      <TraceLine>
        <TraceIcon>
          <FileTextIcon />
        </TraceIcon>
        <TraceTitle>已读取 pnpm-workspace.yaml</TraceTitle>
      </TraceLine>
      <TraceLine>
        <TraceIcon>
          <TerminalIcon />
        </TraceIcon>
        <TraceTitle>已运行 pnpm install</TraceTitle>
      </TraceLine>
    </Trace>
  )
}
