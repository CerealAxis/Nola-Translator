import { InboxIcon } from "lucide-react"

import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/styles/base-nova/ui/item"

export function ItemSizeDemo() {
  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <Item variant="outline">
        <ItemMedia variant="icon">
          <InboxIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>默认尺寸</ItemTitle>
          <ItemDescription>
            适用于大多数场景的标准尺寸。
          </ItemDescription>
        </ItemContent>
      </Item>
      <Item variant="outline" size="sm">
        <ItemMedia variant="icon">
          <InboxIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>小尺寸</ItemTitle>
          <ItemDescription>适合紧凑布局的尺寸</ItemDescription>
        </ItemContent>
      </Item>
      <Item variant="outline" size="xs">
        <ItemMedia variant="icon">
          <InboxIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>超小尺寸</ItemTitle>
          <ItemDescription>最紧凑的尺寸。</ItemDescription>
        </ItemContent>
      </Item>
    </div>
  )
}
