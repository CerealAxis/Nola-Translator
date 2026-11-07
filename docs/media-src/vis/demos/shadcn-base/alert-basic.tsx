import { CheckCircle2Icon } from "lucide-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/styles/base-nova/ui/alert"

export default function AlertBasic() {
  return (
    <Alert className="max-w-md">
      <CheckCircle2Icon />
      <AlertTitle>账户已更新</AlertTitle>
      <AlertDescription>
        个人资料已保存，更改会立即生效。
      </AlertDescription>
    </Alert>
  )
}
