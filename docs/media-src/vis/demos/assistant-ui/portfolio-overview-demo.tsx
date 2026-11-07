import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "title": "投资组合概览",
  "children": [
    {
      "$type": "Row",
      "$key": "facts",
      "gap": 6,
      "children": [
        {
          "$type": "Fact",
          "$key": "value",
          "label": "总价值",
          "value": "$128,430"
        },
        {
          "$type": "Fact",
          "$key": "change",
          "label": "今日",
          "value": "+2.4%"
        },
        {
          "$type": "Fact",
          "$key": "positions",
          "label": "持仓数",
          "value": "12"
        }
      ]
    },
    {
      "$type": "Header",
      "$key": "chart-header",
      "text": "组合表现",
      "size": "sm"
    },
    {
      "$type": "Chart",
      "$key": "chart-bar",
      "variant": "bar",
      "showAxis": true,
      "data": [
        {
          "label": "周一",
          "value": 120400
        },
        {
          "label": "周二",
          "value": 121800
        },
        {
          "label": "周三",
          "value": 119600
        },
        {
          "label": "周四",
          "value": 124200
        },
        {
          "label": "周五",
          "value": 128430
        }
      ]
    },
    {
      "$type": "Table",
      "$key": "holdings",
      "columns": [
        {
          "label": "代码"
        },
        {
          "label": "股数"
        },
        {
          "label": "价格"
        },
        {
          "label": "市值"
        }
      ],
      "rows": [
        [
          "ACME",
          40,
          "$182.10",
          "$7,284.00"
        ],
        [
          "GLBX",
          25,
          "$94.55",
          "$2,363.75"
        ],
        [
          "NORT",
          15,
          "$310.20",
          "$4,653.00"
        ]
      ]
    },
    {
      "$type": "Markdown",
      "$key": "footnote",
      "value": "行情延迟 15 分钟。"
    }
  ]
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
