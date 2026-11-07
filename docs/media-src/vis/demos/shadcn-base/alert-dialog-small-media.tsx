import { BluetoothIcon } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/styles/base-nova/ui/alert-dialog"
import { Button } from "@/styles/base-nova/ui/button"

export function AlertDialogSmallWithMedia() {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="outline">显示对话框</Button>}
      />

      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <BluetoothIcon />
          </AlertDialogMedia>
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
