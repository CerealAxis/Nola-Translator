import {
  CheckIcon,
  CreditCardIcon,
  InfoIcon,
  MailIcon,
  SearchIcon,
  StarIcon,
} from "lucide-react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/styles/base-nova/ui/input-group"

export default function InputGroupIcon() {
  return (
    <div className="grid w-full max-w-sm gap-6">
      <InputGroup>
        <InputGroupInput placeholder="搜索..." />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput type="email" placeholder="输入邮箱" />
        <InputGroupAddon>
          <MailIcon />
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput placeholder="卡号" />
        <InputGroupAddon>
          <CreditCardIcon />
        </InputGroupAddon>
        <InputGroupAddon align="inline-end">
          <CheckIcon />
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput placeholder="卡号" />
        <InputGroupAddon align="inline-end">
          <StarIcon />
          <InfoIcon />
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}
