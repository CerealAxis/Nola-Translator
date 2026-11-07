import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "children": [
    {
      "$type": "Caption",
      "$key": "date",
      "value": "7 月 24 日，星期五"
    },
    {
      "$type": "Header",
      "$key": "title",
      "text": "设计评审",
      "size": "md"
    },
    {
      "$type": "Caption",
      "$key": "time",
      "value": "09:00 至 09:30 · B 会议室"
    }
  ]
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
