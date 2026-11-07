import { BookOpenIcon } from 'lucide-react'
import { defaultDirectiveFormatter } from '@assistant-ui/react'
import { createDirectiveText } from '../../assistant-ui/elements/directive-text'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const Directive = createDirectiveText(defaultDirectiveFormatter, { iconMap: { file: BookOpenIcon } })

export default function Demo() {
  return (
    <AssistantPreview>
      <p className="mx-auto max-w-md text-sm">
        <Directive text="请参考 :file[术语表]{name=glossary} 校对译文。" />
      </p>
    </AssistantPreview>
  )
}
