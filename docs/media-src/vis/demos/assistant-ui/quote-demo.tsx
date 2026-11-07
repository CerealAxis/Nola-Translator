import { useState } from 'react'
import { QuoteReply } from '../../assistant-ui/elements/quote-reply'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const quote = '先统一术语，再检查行文。'

export default function Demo() {
  const [quoted, setQuoted] = useState<string>()
  return (
    <AssistantPreview>
      <div className="mx-auto max-w-sm">
        <QuoteReply
          before="校对可按以下顺序进行："
          selection={quote}
          after="最后核对排版。"
          actions={[{ key: 'quote', label: '引用', icon: 'quote' }]}
          toolbarVisible
          quoted={quoted}
          onAction={() => setQuoted(quote)}
        />
      </div>
    </AssistantPreview>
  )
}
