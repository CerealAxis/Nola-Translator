import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleIcon,
  LoaderCircleIcon,
} from "lucide-react"

import {
  Trace,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/styles/base-rhea/ui/trace"

export function TraceStatus() {
  return (
    <Trace className="max-w-sm">
      <TraceLine>
        <TraceIcon>
          <CircleCheckIcon />
        </TraceIcon>
        <TraceTitle>已运行 pnpm install</TraceTitle>
      </TraceLine>
      <TraceLine status="error">
        <TraceIcon>
          <CircleAlertIcon />
        </TraceIcon>
        <TraceTitle>运行 pnpm lint 失败</TraceTitle>
      </TraceLine>
      <TraceLine status="running">
        <TraceIcon>
          <LoaderCircleIcon className="animate-spin" />
        </TraceIcon>
        <TraceTitle>正在运行 pnpm build</TraceTitle>
      </TraceLine>
      <TraceLine status="pending">
        <TraceIcon>
          <CircleIcon />
        </TraceIcon>
        <TraceTitle>运行 pnpm test</TraceTitle>
      </TraceLine>
    </Trace>
  )
}
