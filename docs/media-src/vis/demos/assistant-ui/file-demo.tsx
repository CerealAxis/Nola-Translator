import { File } from '../../assistant-ui/elements/file'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const filename = '校对清单.txt'
const data = 'data:text/plain;charset=utf-8,' + encodeURIComponent('1. 核对术语\n2. 核对数字和单位\n3. 通读译文')

export default function Demo() {
  return (
    <AssistantPreview>
      <div className="mx-auto max-w-md">
        <File.Root>
          <File.Icon mimeType="text/plain" />
          <File.Name>{filename}</File.Name>
          <File.Download data={data} mimeType="text/plain" filename={filename} />
        </File.Root>
      </div>
    </AssistantPreview>
  )
}
