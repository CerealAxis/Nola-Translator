"use client"

import { toast } from "sonner"

import {
  Bubble,
  BubbleContent,
  BubbleGroup,
} from "@/styles/base-rhea/ui/bubble"

export function BubbleLinkButtonDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8 py-12">
      <Bubble variant="muted">
        <BubbleContent>今天有什么可以帮你？</BubbleContent>
      </Bubble>
      <BubbleGroup>
        <Bubble variant="tinted" align="end">
          <BubbleContent
            render={
              <button onClick={() => toast("你点击了“忘记密码”")} />
            }
          >
            我忘记了密码
          </BubbleContent>
        </Bubble>
        <Bubble variant="tinted" align="end">
          <BubbleContent
            render={
              <button
                onClick={() => toast("你点击了“订阅帮助”")}
              />
            }
          >
            我需要订阅方面的帮助
          </BubbleContent>
        </Bubble>
        <Bubble variant="tinted" align="end">
          <BubbleContent
            render={
              <button
                onClick={() =>
                  toast("你点击了“其他问题”，请联系人工客服。")
                }
              />
            }
          >
            想了解其他内容？请联系人工客服。
          </BubbleContent>
        </Bubble>
      </BubbleGroup>
    </div>
  )
}
