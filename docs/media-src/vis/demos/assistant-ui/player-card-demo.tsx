import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "children": [
    {
      "$type": "Header",
      "$key": "name",
      "text": "陈马库斯",
      "size": "lg"
    },
    {
      "$type": "Caption",
      "$key": "position",
      "value": "控球后卫 · 23 号"
    },
    {
      "$type": "Row",
      "$key": "stats",
      "justify": "between",
      "children": [
        {
          "$type": "Col",
          "$key": "pts",
          "align": "center",
          "gap": 1,
          "children": [
            {
              "$type": "Text",
              "$key": "value",
              "value": "24.6",
              "size": "2xl",
              "weight": "bold"
            },
            {
              "$type": "Caption",
              "$key": "label",
              "value": "场均得分"
            }
          ]
        },
        {
          "$type": "Col",
          "$key": "ast",
          "align": "center",
          "gap": 1,
          "children": [
            {
              "$type": "Text",
              "$key": "value",
              "value": "8.1",
              "size": "2xl",
              "weight": "bold"
            },
            {
              "$type": "Caption",
              "$key": "label",
              "value": "助攻"
            }
          ]
        },
        {
          "$type": "Col",
          "$key": "reb",
          "align": "center",
          "gap": 1,
          "children": [
            {
              "$type": "Text",
              "$key": "value",
              "value": "5.3",
              "size": "2xl",
              "weight": "bold"
            },
            {
              "$type": "Caption",
              "$key": "label",
              "value": "篮板"
            }
          ]
        },
        {
          "$type": "Col",
          "$key": "eff",
          "align": "center",
          "gap": 1,
          "children": [
            {
              "$type": "Text",
              "$key": "value",
              "value": "27.9",
              "size": "2xl",
              "weight": "bold"
            },
            {
              "$type": "Caption",
              "$key": "label",
              "value": "效率值"
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
