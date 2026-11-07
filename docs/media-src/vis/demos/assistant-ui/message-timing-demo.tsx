import { MessageTiming } from '../../assistant-ui/elements/message-timing'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

export default function Demo() {
  return (
    <AssistantPreview>
      <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
        <p>我已核对原文与译文中的人名、地名和计量单位。</p>
        <MessageTiming stats={[
          { label: '首字延迟', value: '0.24 秒' },
          { label: '总耗时', value: '2.8 秒' },
          { label: '生成速率', value: '48 词元/秒' },
        ]} />
      </div>
    </AssistantPreview>
  )
}
