import { AlertTriangleIcon } from "lucide-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/styles/base-nova/ui/alert"

export default function AlertColors() {
  return (
    <Alert className="max-w-md border-chart-4/25 [&>svg]:text-chart-4">
      <AlertTriangleIcon />
      <AlertTitle>订阅将在 3 天后到期。</AlertTitle>
      <AlertDescription>
        立即续订以避免服务中断，或升级到付费方案以继续使用。
      </AlertDescription>
    </Alert>
  )
}
