"use client"

import { Button } from "@/styles/base-nova/ui/button"
import { toast, Toaster } from "@/styles/base-nova/ui/toast"

export function ToastDemo() {
  function showToast() {
    const id = toast.add({
      title: "活动已创建",
      description: "12 月 3 日星期日 上午 9:00",
      actionProps: {
        children: "撤销",
        onClick() {
          toast.close(id)
        },
      },
    })
  }

  return (
    <Toaster>
      <Button variant="outline" onClick={showToast}>
        显示 Toast 通知
      </Button>
    </Toaster>
  )
}
