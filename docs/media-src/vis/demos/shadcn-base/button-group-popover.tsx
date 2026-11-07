import { BotIcon, ChevronDownIcon } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import { ButtonGroup } from "@/styles/base-nova/ui/button-group"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/styles/base-nova/ui/field"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/styles/base-nova/ui/popover"
import { Textarea } from "@/styles/base-nova/ui/textarea"

export default function ButtonGroupPopover() {
  return (
    <ButtonGroup>
      <Button variant="outline">
        <BotIcon /> Copilot
      </Button>
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="icon" aria-label="打开弹出层" />
          }
        >
          <ChevronDownIcon />
        </PopoverTrigger>
        <PopoverContent align="end" className="rounded-xl text-sm">
          <PopoverHeader>
            <PopoverTitle>使用 Copilot 开始新任务</PopoverTitle>
            <PopoverDescription>
              用自然语言描述任务。
            </PopoverDescription>
          </PopoverHeader>
          <Field>
            <FieldLabel htmlFor="task" className="sr-only">
              任务描述
            </FieldLabel>
            <Textarea
              id="task"
              placeholder="我需要..."
              className="resize-none"
            />
            <FieldDescription>
              Copilot 会创建一个拉取请求供审查。
            </FieldDescription>
          </Field>
        </PopoverContent>
      </Popover>
    </ButtonGroup>
  )
}
