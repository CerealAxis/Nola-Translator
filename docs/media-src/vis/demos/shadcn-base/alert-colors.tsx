import { AlertTriangleIcon } from "lucide-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/styles/base-nova/ui/alert"

export default function AlertColors() {
  return (
    <Alert className="max-w-md border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
      <AlertTriangleIcon />
      <AlertTitle>订阅将在 3 天后到期。</AlertTitle>
      <AlertDescription>
        立即续订以避免服务中断，或升级到付费方案以继续使用。
      </AlertDescription>
    </Alert>
  )
}
