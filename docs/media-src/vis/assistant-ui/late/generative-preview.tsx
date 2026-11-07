import { useState } from 'react'
import { renderGenerativeUI, type GenerativeUIDispatch } from '@assistant-ui/generative-ui/react'
import { styledGenerativeUILibrary } from '../elements/generative-ui'
import { AssistantPreview } from '../preview-scope'

const feedback: Record<string, string> = {
  add_to_calendar: '已记录添加到日历的操作。',
  add_to_cart: '示例商品已加入购物车。',
  book_stay: '已记录预订选择。',
  book_reservation: '已记录订位信息。',
  cancel_delete: '已取消删除。',
  confirm_delete: '已确认删除示例文件。',
  confirm_purchase: '已确认示例购买。',
  create_task: '已记录新任务。',
  discard_email: '已丢弃示例草稿。',
  purchase_cart: '已提交示例购物车。',
  send_email: '已提交示例邮件。',
}

export function GenerativePreview({ spec }: { spec: unknown }) {
  const [message, setMessage] = useState('')
  const dispatch: GenerativeUIDispatch = action => {
    setMessage(feedback[action.type] ?? '已收到示例操作。')
  }

  return (
    <AssistantPreview>
      <div className="aui-generative-preview mx-auto w-full max-w-lg [--aui-success:var(--chart-2)] [--aui-warning:var(--chart-4)]">
        {renderGenerativeUI(spec, styledGenerativeUILibrary, { status: 'done', dispatch })}
        <p role="status" className="mt-2 text-sm text-muted-foreground empty:hidden">{message}</p>
      </div>
    </AssistantPreview>
  )
}
