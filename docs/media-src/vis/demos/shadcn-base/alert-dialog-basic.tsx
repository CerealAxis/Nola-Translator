import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/styles/base-nova/ui/alert-dialog"
import { Button } from "@/styles/base-nova/ui/button"

export function AlertDialogBasic() {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="outline">显示对话框</Button>}
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确定要继续吗？</AlertDialogTitle>
          <AlertDialogDescription>
            此操作无法撤销。你的账户及其数据将从我们的服务器中永久删除。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction>继续</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
