import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "children": [
    {
      "$type": "Row",
      "$key": "header",
      "justify": "between",
      "align": "center",
      "children": [
        {
          "$type": "Text",
          "$key": "city",
          "value": "得克萨斯州奥斯汀",
          "color": "secondary"
        },
        {
          "$type": "Icon",
          "$key": "icon",
          "name": "sun",
          "size": "lg"
        }
      ]
    },
    {
      "$type": "Text",
      "$key": "temp",
      "value": "94°F",
      "size": "3xl",
      "weight": "bold"
    },
    {
      "$type": "Text",
      "$key": "description",
      "value": "晴朗，体感 98°F",
      "color": "secondary"
    }
  ]
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
