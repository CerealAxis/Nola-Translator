"use client"

import { Button } from "@/styles/base-nova/ui/button"
import { toast } from "@/styles/base-nova/ui/toast"

export function ToastTypes() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={() => toast.add({ description: "活动已创建。" })}
      >
        默认
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.add({
            type: "success",
            description: "活动已创建。",
          })
        }
      >
        成功
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.add({
            type: "info",
            description: "请提前 10 分钟到达。",
          })
        }
      >
        信息
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.add({
            type: "warning",
            description: "活动最早于上午 8:00 开始。",
          })
        }
      >
        警告
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.add({
            type: "error",
            description: "无法创建活动。",
            priority: "high",
          })
        }
      >
        错误
      </Button>
    </div>
  )
}
