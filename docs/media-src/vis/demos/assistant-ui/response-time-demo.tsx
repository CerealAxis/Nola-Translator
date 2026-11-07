import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "title": "响应时间（p50）",
  "children": [
    {
      "$type": "Chart",
      "$key": "chart",
      "variant": "line",
      "showAxis": true,
      "data": [
        {
          "label": "00:00",
          "value": 120
        },
        {
          "label": "04:00",
          "value": 98
        },
        {
          "label": "08:00",
          "value": 210
        },
        {
          "label": "12:00",
          "value": 340
        },
        {
          "label": "16:00",
          "value": 280
        },
        {
          "label": "20:00",
          "value": 190
        }
      ]
    }
  ]
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
