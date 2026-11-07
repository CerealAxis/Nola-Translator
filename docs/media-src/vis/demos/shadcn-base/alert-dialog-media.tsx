import { CircleFadingPlusIcon } from "lucide-react"

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

export function AlertDialogWithMedia() {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="outline">分享项目</Button>}
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <CircleFadingPlusIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>分享此项目吗？</AlertDialogTitle>
          <AlertDialogDescription>
            任何拥有此链接的人都可以查看和编辑此项目。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction>分享</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
