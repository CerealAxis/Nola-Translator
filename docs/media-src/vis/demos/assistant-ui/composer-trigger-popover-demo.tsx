import { ComposerPrimitive, type TriggerAdapter } from '@assistant-ui/react'
import { DemoRuntime } from '../../assistant-ui/demo-runtime'
import { ComposerTriggerPopover } from '../../assistant-ui/elements/composer-trigger-popover.aui'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const files = [
  { id: 'glossary', type: 'file', label: '项目术语表' },
  { id: 'minutes', type: 'file', label: '会议纪要' },
]

const adapter: TriggerAdapter = {
  categories: () => [{ id: 'files', label: '文件' }],
  categoryItems: () => files,
  search: query => files.filter(file => file.label.includes(query)),
}

export default function Demo() {
  return (
    <AssistantPreview>
      <DemoRuntime>
        <ComposerPrimitive.TriggerPopoverRoot>
          <ComposerPrimitive.Root className="mx-auto max-w-md">
            <ComposerPrimitive.Input className="w-full resize-none rounded-lg border border-input bg-card p-3 text-sm text-card-foreground dark:bg-input/30" placeholder="输入 @ 引用文件" />
            <ComposerTriggerPopover char="@" adapter={adapter} directive={{}} />
          </ComposerPrimitive.Root>
        </ComposerPrimitive.TriggerPopoverRoot>
      </DemoRuntime>
    </AssistantPreview>
  )
}
