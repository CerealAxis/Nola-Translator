import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/styles/base-nova/ui/progress"

export function ProgressWithLabel() {
  return (
    <Progress value={56} className="w-full max-w-sm">
      <ProgressLabel>上传进度</ProgressLabel>
      <ProgressValue />
    </Progress>
  )
}
