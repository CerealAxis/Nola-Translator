import { AlertCircleIcon } from "lucide-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/styles/base-nova/ui/alert"

export default function AlertDestructive() {
  return (
    <Alert variant="destructive" className="max-w-md">
      <AlertCircleIcon />
      <AlertTitle>支付失败</AlertTitle>
      <AlertDescription>
        无法处理付款。请检查付款方式后重试。
      </AlertDescription>
    </Alert>
  )
}
