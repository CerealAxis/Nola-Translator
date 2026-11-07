import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "children": [
    {
      "$type": "Row",
      "$key": "airline-row",
      "justify": "between",
      "children": [
        {
          "$type": "Caption",
          "$key": "airline",
          "value": "联合航空 · UA 872"
        },
        {
          "$type": "Caption",
          "$key": "status",
          "value": "准点"
        }
      ]
    },
    {
      "$type": "Row",
      "$key": "cities",
      "justify": "between",
      "align": "center",
      "children": [
        {
          "$type": "Text",
          "$key": "origin",
          "value": "SFO",
          "size": "3xl",
          "weight": "bold"
        },
        {
          "$type": "Text",
          "$key": "arrow",
          "value": "",
          "color": "secondary",
          "children": {
            "$type": "Icon",
            "name": "plane",
            "size": "md"
          }
        },
        {
          "$type": "Text",
          "$key": "dest",
          "value": "NRT",
          "size": "3xl",
          "weight": "bold"
        }
      ]
    },
    {
      "$type": "Box",
      "$key": "track",
      "width": "100%",
      "height": 6,
      "radius": "full",
      "background": "color-mix(in oklab, var(--foreground) 8%, transparent)",
      "children": {
        "$type": "Box",
        "width": "62%",
        "height": 6,
        "radius": "full",
        "background": "var(--aui-live, #3b82f6)"
      }
    },
    {
      "$type": "Row",
      "$key": "meta",
      "justify": "between",
      "children": [
        {
          "$type": "Caption",
          "$key": "elapsed",
          "value": "已飞行 6 小时 40 分钟"
        },
        {
          "$type": "Caption",
          "$key": "remaining",
          "value": "剩余 4 小时 10 分钟"
        }
      ]
    }
  ]
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
