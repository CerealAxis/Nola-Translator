import { Button } from "@/styles/base-nova/ui/button"
import { Textarea } from "@/styles/base-nova/ui/textarea"

export function TextareaButton() {
  return (
    <div className="grid w-full gap-2">
      <Textarea placeholder="在此输入消息。" />
      <Button>发送消息</Button>
    </div>
  )
}
