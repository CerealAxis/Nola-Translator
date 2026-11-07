import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "children": [
    {
      "$type": "Header",
      "$key": "eta",
      "text": "4 分钟后抵达",
      "size": "3xl"
    },
    {
      "$type": "Text",
      "$key": "car",
      "value": "丰田凯美瑞 · ABC 1234",
      "color": "secondary"
    },
    {
      "$type": "Divider",
      "$key": "divider"
    },
    {
      "$type": "Row",
      "$key": "facts",
      "gap": 6,
      "children": [
        {
          "$type": "Row",
          "$key": "pickup",
          "align": "start",
          "children": [
            {
              "$type": "Icon",
              "$key": "icon",
              "name": "map-pin",
              "size": "sm"
            },
            {
              "$type": "Fact",
              "$key": "fact",
              "label": "上车地点",
              "value": "市场街 123 号"
            }
          ]
        },
        {
          "$type": "Fact",
          "$key": "driver",
          "label": "司机",
          "value": "林师傅 · 4.98 ★"
        }
      ]
    }
  ]
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
