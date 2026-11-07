import { Trash2Icon } from "lucide-react"

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

export function AlertDialogDestructive() {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="destructive">删除对话</Button>}
      />
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>删除对话吗？</AlertDialogTitle>
          <AlertDialogDescription>
            此操作将永久删除这段对话。查看{" "}
            <a href="#">设置</a> 删除本次聊天中保存的所有记忆。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive">删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
