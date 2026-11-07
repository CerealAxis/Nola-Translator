import { AuiConfig, AuiProvider, useAui } from '@assistant-ui/react'
import { McpManagerResource, McpMemoryStorage } from '@assistant-ui/react-mcp'
import { DemoRuntime } from '../../assistant-ui/demo-runtime'
import { McpConfigDialog } from '../../assistant-ui/elements/mcp-config.aui'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const config = AuiConfig({
  mcp: McpManagerResource({
    autoConnect: false,
    storage: McpMemoryStorage(),
  }),
})

function Settings() {
  const aui = useAui()
  return (
    <AuiProvider extends={aui} config={config}>
      <McpConfigDialog />
    </AuiProvider>
  )
}

export default function Demo() {
  return (
    <AssistantPreview>
      <DemoRuntime>
        <div className="flex justify-center"><Settings /></div>
      </DemoRuntime>
    </AssistantPreview>
  )
}
