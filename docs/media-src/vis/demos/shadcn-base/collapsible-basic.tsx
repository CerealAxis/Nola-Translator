import { ChevronDownIcon } from "@/registry/icons/__lucide__"
import { Button } from "@/styles/base-nova/ui/button"
import { Card, CardContent } from "@/styles/base-nova/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/styles/base-nova/ui/collapsible"

export function CollapsibleBasic() {
  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardContent>
        <Collapsible className="rounded-md data-open:bg-muted">
          <CollapsibleTrigger
            render={<Button variant="ghost" className="w-full" />}
          >
            产品详情
            <ChevronDownIcon className="ml-auto group-data-panel-open/button:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col items-start gap-2 p-2.5 pt-0 text-sm">
            <div>
              展开或折叠此面板以显示更多内容。
            </div>
            <Button size="xs">了解更多</Button>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
