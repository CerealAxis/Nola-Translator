import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "title": "河畔阁楼",
  "children": [
    {
      "$type": "Image",
      "$key": "image",
      "src": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=640&q=80",
      "alt": "带开放式厨房和红色扶手椅的阁楼内景"
    },
    {
      "$type": "Row",
      "$key": "meta",
      "justify": "between",
      "align": "center",
      "children": [
        {
          "$type": "Caption",
          "$key": "details",
          "value": "阿尔法玛 · 2 位房客 · 1 张床"
        },
        {
          "$type": "Badge",
          "$key": "rating",
          "value": "4.9",
          "variant": "success"
        }
      ]
    },
    {
      "$type": "Button",
      "$key": "book",
      "label": "预订，每晚 142 美元",
      "buttonStyle": "primary",
      "block": true,
      "$action": {
        "type": "book_stay",
        "stayId": "riverside-loft"
      }
    }
  ]
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
