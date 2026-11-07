import { ArrowUpIcon } from "lucide-react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "@/styles/base-nova/ui/input-group"
import { Spinner } from "@/styles/base-nova/ui/spinner"

export function SpinnerInputGroup() {
  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <InputGroup>
        <InputGroupInput placeholder="发送消息..." disabled />
        <InputGroupAddon align="inline-end">
          <Spinner />
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupTextarea placeholder="发送消息..." disabled />
        <InputGroupAddon align="block-end">
          <Spinner /> 正在验证...
          <InputGroupButton className="ml-auto" variant="default">
            <ArrowUpIcon />
            <span className="sr-only">发送</span>
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}
