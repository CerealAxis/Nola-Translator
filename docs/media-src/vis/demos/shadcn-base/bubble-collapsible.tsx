"use client"

import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { Bubble, BubbleContent } from "@/styles/base-rhea/ui/bubble"
import { Button } from "@/styles/base-rhea/ui/button"
import {
  Collapsible,
  CollapsibleTrigger,
} from "@/styles/base-rhea/ui/collapsible"

const text = `无障碍检查发现，深色模式下有两处焦点状态不够醒目。

我检查了对话框、菜单和抽屉的交互流程，因为它们都会在分层界面中显示可聚焦控件。

对话框和抽屉没有问题。菜单需要将悬停与焦点样式令牌分开，这样即使不使用指针，键盘焦点也能清楚显示。

我还建议将这项改动放在样式文件中，而不是基础组件里，这样其他主题之后可以自行选择焦点样式。`

const previewLength = 180

export function BubbleCollapsible() {
  const [open, setOpen] = React.useState(false)
  const isLong = text.length > previewLength
  const preview = `${text.slice(0, previewLength)}...`

  return (
    <div className="flex w-full max-w-sm flex-col gap-8 py-12">
      <Bubble variant="muted">
        <BubbleContent>今天有什么可以帮你？</BubbleContent>
      </Bubble>

      <Bubble variant="muted" align="end">
        <BubbleContent className="whitespace-pre-line">
          <Collapsible open={open} onOpenChange={setOpen}>
            <div>{open || !isLong ? text : preview}</div>
            {isLong ? (
              <CollapsibleTrigger
                render={
                  <Button
                    variant="link"
                    className="gap-1 p-0 text-muted-foreground"
                  />
                }
              >
                {open ? "收起" : "展开"}
                <ChevronDownIcon
                  data-icon="inline-end"
                  className="group-data-panel-open/button:rotate-180"
                />
              </CollapsibleTrigger>
            ) : null}
          </Collapsible>
        </BubbleContent>
      </Bubble>
    </div>
  )
}
