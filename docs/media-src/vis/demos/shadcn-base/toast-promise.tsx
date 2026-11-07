"use client"

import { Button } from "@/styles/base-nova/ui/button"
import { toast } from "@/styles/base-nova/ui/toast"

export function ToastPromise() {
  function showToast() {
    toast.promise(
      new Promise<{ name: string }>((resolve) => {
        window.setTimeout(() => resolve({ name: "Event" }), 2000)
      }),
      {
        loading: "正在创建活动……",
        success: (data) => `已创建活动：${data.name}`,
        error: "无法创建事件。",
      }
    )
  }

  return (
    <Button variant="outline" onClick={showToast}>
      创建活动
    </Button>
  )
}
