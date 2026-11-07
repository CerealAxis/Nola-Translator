import { InboxIcon } from "lucide-react"

import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/styles/base-nova/ui/item"

export function ItemVariant() {
  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <Item>
        <ItemMedia variant="icon">
          <InboxIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>默认变体</ItemTitle>
          <ItemDescription>
            透明背景且无边框。
          </ItemDescription>
        </ItemContent>
      </Item>
      <Item variant="outline">
        <ItemMedia variant="icon">
          <InboxIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>描边变体</ItemTitle>
          <ItemDescription>
            带有可见边框的描边样式。
          </ItemDescription>
        </ItemContent>
      </Item>
      <Item variant="muted">
        <ItemMedia variant="icon">
          <InboxIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>柔和变体</ItemTitle>
          <ItemDescription>
            次要内容使用柔和背景。
          </ItemDescription>
        </ItemContent>
      </Item>
    </div>
  )
}
