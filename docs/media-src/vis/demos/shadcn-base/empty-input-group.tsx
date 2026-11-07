import { SearchIcon } from "lucide-react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/styles/base-nova/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/styles/base-nova/ui/input-group"
import { Kbd } from "@/styles/base-nova/ui/kbd"

export default function EmptyInputGroup() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>404 - 页面未找到</EmptyTitle>
        <EmptyDescription>
          你要查找的页面不存在。试着在下方搜索所需内容。
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <InputGroup className="sm:w-3/4">
          <InputGroupInput placeholder="试着搜索页面..." />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupAddon align="inline-end">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        </InputGroup>
        <EmptyDescription>
          需要帮助吗？ <a href="#">联系支持</a>
        </EmptyDescription>
      </EmptyContent>
    </Empty>
  )
}
