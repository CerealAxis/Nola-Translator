import { GitBranchIcon } from "lucide-react"

import {
  Trace,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/styles/base-rhea/ui/trace"

export function TraceStatic() {
  return (
    <Trace className="max-w-sm">
      <TraceLine>
        <TraceIcon>
          <GitBranchIcon />
        </TraceIcon>
        <TraceTitle>已创建分支 fix/frozen-lockfile</TraceTitle>
      </TraceLine>
    </Trace>
  )
}
