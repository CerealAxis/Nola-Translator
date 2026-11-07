import { CheckCircle2Icon, InfoIcon } from "lucide-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/styles/base-nova/ui/alert"

export default function AlertDemo() {
  return (
    <div className="grid w-full max-w-md items-start gap-4">
      <Alert>
        <CheckCircle2Icon />
        <AlertTitle>支付成功</AlertTitle>
        <AlertDescription>
          已处理 $29.99 的付款，并向你的邮箱发送了收据。
        </AlertDescription>
      </Alert>
      <Alert>
        <InfoIcon />
        <AlertTitle>发现新功能</AlertTitle>
        <AlertDescription>
          现已支持深色模式。你可以在账户设置中启用。
        </AlertDescription>
      </Alert>
    </div>
  )
}
