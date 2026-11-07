import { HeatGraph } from '../../assistant-ui/elements/heat-graph'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const data = Array.from({ length: 112 }, (_, index) => {
  const date = new Date()
  date.setDate(date.getDate() - 111 + index)
  return { date, count: (index * 7 + Math.floor(index / 9)) % 18 }
})

export default function Demo() {
  return (
    <AssistantPreview>
      <div className="mx-auto max-w-2xl overflow-x-auto">
        <div className="min-w-96"><HeatGraph data={data} /></div>
      </div>
    </AssistantPreview>
  )
}
