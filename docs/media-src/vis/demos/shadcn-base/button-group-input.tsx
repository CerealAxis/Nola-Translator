import { SearchIcon } from "lucide-react"

import { Button } from "@/styles/base-nova/ui/button"
import { ButtonGroup } from "@/styles/base-nova/ui/button-group"
import { Input } from "@/styles/base-nova/ui/input"

export default function ButtonGroupInput() {
  return (
    <ButtonGroup>
      <Input placeholder="搜索..." />
      <Button variant="outline" aria-label="搜索">
        <SearchIcon />
      </Button>
    </ButtonGroup>
  )
}
