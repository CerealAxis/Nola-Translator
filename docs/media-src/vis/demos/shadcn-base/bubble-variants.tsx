import { Markdown } from "@/components/markdown"
import {
  Bubble,
  BubbleContent,
  BubbleReactions,
} from "@/styles/base-rhea/ui/bubble"

export function BubbleVariantsDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-12 py-12">
      <Bubble>
        <BubbleContent>这是默认的主要气泡样式。</BubbleContent>
      </Bubble>
      <Bubble variant="secondary" align="end">
        <BubbleContent>这是次要变体。</BubbleContent>
      </Bubble>
      <Bubble variant="muted">
        <BubbleContent>
          这是柔和变体，对话气泡采用较低强调度的颜色。
        </BubbleContent>
        <BubbleReactions role="img" aria-label="反应：点赞">
          <span>👍</span>
        </BubbleReactions>
      </Bubble>
      <Bubble variant="tinted" align="end">
        <BubbleContent>
          这是浅色变体，颜色由主色调柔化而来。
        </BubbleContent>
      </Bubble>
      <Bubble variant="outline">
        <BubbleContent>也可以使用描边变体。</BubbleContent>
      </Bubble>
      <Bubble variant="destructive" align="end">
        <BubbleContent>也可以使用带有反应按钮的危险变体。</BubbleContent>
        <BubbleReactions role="img" aria-label="反应：火焰">
          <span>🔥</span>
        </BubbleReactions>
      </Bubble>
      <Bubble variant="ghost">
        <BubbleContent>
          <Markdown>{`幽灵气泡适用于助手文本、**Markdown** 以及其他不需要边框的内容。

它非常适合不需要边框、并可占满容器宽度的助手消息。你也可以在其中渲染 \`code\`。

幽灵气泡没有边框，可以占满整个容器宽度。
`}</Markdown>
        </BubbleContent>
      </Bubble>
    </div>
  )
}
