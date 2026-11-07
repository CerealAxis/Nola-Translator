import { ShieldAlertIcon } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/styles/base-nova/ui/item"

export function ItemIcon() {
  return (
    <div className="flex w-full max-w-lg flex-col gap-6">
      <Item variant="outline">
        <ItemMedia variant="icon">
          <ShieldAlertIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>安全警报</ItemTitle>
          <ItemDescription>
            检测到来自未知设备的新登录。
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button size="sm" variant="outline">
            审查
          </Button>
        </ItemActions>
      </Item>
    </div>
  )
}
