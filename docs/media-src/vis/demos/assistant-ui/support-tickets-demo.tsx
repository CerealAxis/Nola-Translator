import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "title": "按渠道统计支持工单",
  "children": [
    {
      "$type": "Chart",
      "$key": "chart",
      "variant": "bar",
      "stacked": true,
      "showAxis": true,
      "showLegend": true,
      "series": [
        {
          "label": "邮件",
          "data": [
            {
              "label": "第 1 周",
              "value": 42
            },
            {
              "label": "第 2 周",
              "value": 38
            },
            {
              "label": "第 3 周",
              "value": 51
            },
            {
              "label": "第 4 周",
              "value": 35
            }
          ]
        },
        {
          "label": "在线聊天",
          "data": [
            {
              "label": "第 1 周",
              "value": 28
            },
            {
              "label": "第 2 周",
              "value": 33
            },
            {
              "label": "第 3 周",
              "value": 25
            },
            {
              "label": "第 4 周",
              "value": 40
            }
          ]
        },
        {
          "label": "电话",
          "data": [
            {
              "label": "第 1 周",
              "value": 12
            },
            {
              "label": "第 2 周",
              "value": 9
            },
            {
              "label": "第 3 周",
              "value": 15
            },
            {
              "label": "第 4 周",
              "value": 11
            }
          ]
        }
      ]
    }
  ]
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
