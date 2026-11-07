"use client"

import * as React from "react"
import {
  IconCheck,
  IconCopy,
  IconInfoCircle,
  IconStar,
} from "@tabler/icons-react"

import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/styles/base-nova/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/styles/base-nova/ui/popover"

export default function InputGroupButtonExample() {
  const { copyToClipboard, isCopied } = useCopyToClipboard()
  const [isFavorite, setIsFavorite] = React.useState(false)

  return (
    <div className="grid w-full max-w-sm gap-6">
      <InputGroup>
        <InputGroupInput placeholder="https://x.com/shadcn" readOnly />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label="复制"
            title="复制"
            size="icon-xs"
            onClick={() => {
              copyToClipboard("https://x.com/shadcn")
            }}
          >
            {isCopied ? <IconCheck /> : <IconCopy />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup className="[--radius:9999px]">
        <Popover>
          <PopoverTrigger render={<InputGroupAddon />}>
            <InputGroupButton variant="secondary" size="icon-xs">
              <IconInfoCircle />
            </InputGroupButton>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="flex flex-col gap-1 rounded-xl text-sm"
          >
            <p className="font-medium">连接不安全。</p>
            <p>请勿在此网站输入敏感信息。</p>
          </PopoverContent>
        </Popover>
        <InputGroupAddon className="pl-1.5 text-muted-foreground">
          https://
        </InputGroupAddon>
        <InputGroupInput id="input-secure-19" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            onClick={() => setIsFavorite(!isFavorite)}
            size="icon-xs"
          >
            <IconStar
              data-favorite={isFavorite}
              className="data-[favorite=true]:fill-blue-600 data-[favorite=true]:stroke-blue-600"
            />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput placeholder="输入内容以搜索..." />
        <InputGroupAddon align="inline-end">
          <InputGroupButton variant="secondary">搜索</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}
