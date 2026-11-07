import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "title": "新邮件",
  "children": {
    "$type": "Form",
    "$action": {
      "type": "send_email"
    },
    "children": [
      {
        "$type": "Row",
        "$key": "from-row",
        "align": "center",
        "children": [
          {
            "$type": "Caption",
            "$key": "from-label",
            "value": "发件人"
          },
          {
            "$type": "Text",
            "$key": "from-value",
            "value": "me@example.com",
            "size": "sm"
          }
        ]
      },
      {
        "$type": "Row",
        "$key": "to-row",
        "align": "center",
        "children": [
          {
            "$type": "Caption",
            "$key": "to-label",
            "value": "收件人"
          },
          {
            "$type": "Input",
            "$key": "to-input",
            "name": "to",
            "placeholder": "recipient@example.com"
          }
        ]
      },
      {
        "$type": "Input",
        "$key": "subject",
        "name": "subject",
        "label": "主题",
        "placeholder": "主题"
      },
      {
        "$type": "Input",
        "$key": "body",
        "name": "body",
        "label": "正文",
        "multiline": true,
        "placeholder": "输入邮件内容…"
      },
      {
        "$type": "Row",
        "$key": "actions",
        "justify": "end",
        "children": [
          {
            "$type": "Button",
            "$key": "discard",
            "label": "舍弃",
            "buttonStyle": "ghost",
            "$action": {
              "type": "discard_email"
            }
          },
          {
            "$type": "Button",
            "$key": "send",
            "label": "发送邮件",
            "buttonStyle": "primary",
            "submit": true
          }
        ]
      }
    ]
  }
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
