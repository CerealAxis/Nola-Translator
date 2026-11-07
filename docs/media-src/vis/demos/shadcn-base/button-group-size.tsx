import { PlusIcon } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import { ButtonGroup } from "@/styles/base-nova/ui/button-group"

export default function ButtonGroupSize() {
  return (
    <div className="flex flex-col items-start gap-8">
      <ButtonGroup>
        <Button variant="outline" size="sm">
          小
        </Button>
        <Button variant="outline" size="sm">
          按钮
        </Button>
        <Button variant="outline" size="sm">
          分组
        </Button>
        <Button variant="outline" size="icon-sm">
          <PlusIcon />
        </Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="outline">默认</Button>
        <Button variant="outline">按钮</Button>
        <Button variant="outline">分组</Button>
        <Button variant="outline" size="icon">
          <PlusIcon />
        </Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="outline" size="lg">
          大
        </Button>
        <Button variant="outline" size="lg">
          按钮
        </Button>
        <Button variant="outline" size="lg">
          分组
        </Button>
        <Button variant="outline" size="icon-lg">
          <PlusIcon />
        </Button>
      </ButtonGroup>
    </div>
  )
}
