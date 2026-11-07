import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "title": "每周活跃用户",
  "children": [
    {
      "$type": "Chart",
      "$key": "chart",
      "variant": "area",
      "stacked": true,
      "showAxis": true,
      "showLegend": true,
      "series": [
        {
          "label": "新用户",
          "data": [
            {
              "label": "周一",
              "value": 320
            },
            {
              "label": "周二",
              "value": 410
            },
            {
              "label": "周三",
              "value": 380
            },
            {
              "label": "周四",
              "value": 460
            },
            {
              "label": "周五",
              "value": 520
            },
            {
              "label": "周六",
              "value": 300
            },
            {
              "label": "周日",
              "value": 260
            }
          ]
        },
        {
          "label": "回访用户",
          "data": [
            {
              "label": "周一",
              "value": 890
            },
            {
              "label": "周二",
              "value": 910
            },
            {
              "label": "周三",
              "value": 940
            },
            {
              "label": "周四",
              "value": 980
            },
            {
              "label": "周五",
              "value": 1020
            },
            {
              "label": "周六",
              "value": 760
            },
            {
              "label": "周日",
              "value": 700
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
