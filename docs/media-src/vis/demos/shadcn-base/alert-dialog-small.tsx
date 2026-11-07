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

export function AlertDialogSmall() {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="outline">显示对话框</Button>}
      />
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>允许配件连接吗？</AlertDialogTitle>
          <AlertDialogDescription>
            是否允许 USB 配件连接到此设备？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>不允许</AlertDialogCancel>
          <AlertDialogAction>允许</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
