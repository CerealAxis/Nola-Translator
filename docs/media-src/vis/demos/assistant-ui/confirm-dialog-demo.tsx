import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "children": [
    {
      "$type": "Header",
      "$key": "title",
      "text": "删除这个文件？",
      "size": "md"
    },
    {
      "$type": "Text",
      "$key": "question",
      "value": "此操作无法撤销。确认继续吗？",
      "size": "sm",
      "color": "secondary"
    },
    {
      "$type": "Row",
      "$key": "actions",
      "justify": "end",
      "children": [
        {
          "$type": "Button",
          "$key": "no",
          "label": "取消",
          "buttonStyle": "outline",
          "$action": {
            "type": "cancel_delete"
          }
        },
        {
          "$type": "Button",
          "$key": "yes",
          "label": "确认",
          "buttonStyle": "primary",
          "$action": {
            "type": "confirm_delete"
          }
        }
      ]
    }
  ]
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
