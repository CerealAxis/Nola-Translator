import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/styles/base-nova/ui/alert"
import { Button } from "@/styles/base-nova/ui/button"

export default function AlertActionExample() {
  return (
    <Alert className="max-w-md">
      <AlertTitle>现已支持深色模式</AlertTitle>
      <AlertDescription>
        在个人资料设置中启用即可开始使用。
      </AlertDescription>
      <AlertAction>
        <Button size="xs" variant="default">
          启用
        </Button>
      </AlertAction>
    </Alert>
  )
}
