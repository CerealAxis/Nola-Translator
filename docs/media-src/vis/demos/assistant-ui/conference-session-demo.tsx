import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "children": [
    {
      "$type": "Caption",
      "$key": "kicker",
      "value": "分会场 2 · AI 工程"
    },
    {
      "$type": "Header",
      "$key": "title",
      "text": "构建可靠的智能体循环",
      "size": "md"
    },
    {
      "$type": "Text",
      "$key": "description",
      "value": "结合生产案例，讲解重试、工具调用验证和人工介入方式。",
      "size": "sm",
      "color": "secondary"
    },
    {
      "$type": "Row",
      "$key": "meta",
      "gap": 3,
      "children": [
        {
          "$type": "Caption",
          "$key": "location",
          "value": "B 厅"
        },
        {
          "$type": "Caption",
          "$key": "time",
          "value": "14:30 至 15:15"
        }
      ]
    },
    {
      "$type": "Divider",
      "$key": "divider"
    },
    {
      "$type": "Row",
      "$key": "speaker-1",
      "justify": "between",
      "align": "center",
      "children": [
        {
          "$type": "Row",
          "$key": "info",
          "align": "center",
          "children": [
            {
              "$type": "Image",
              "$key": "avatar",
              "src": "https://i.pravatar.cc/150?img=47",
              "alt": "普丽娅·奈尔",
              "size": "sm",
              "round": true
            },
            {
              "$type": "Col",
              "$key": "text",
              "gap": 0,
              "children": [
                {
                  "$type": "Text",
                  "$key": "name",
                  "value": "普丽娅·奈尔",
                  "weight": "medium"
                },
                {
                  "$type": "Caption",
                  "$key": "title",
                  "value": "Agentbase 资深工程师"
                }
              ]
            }
          ]
        },
        {
          "$type": "Button",
          "$key": "view",
          "label": "查看",
          "buttonStyle": "outline",
          "$action": {
            "type": "view_speaker",
            "speakerId": "priya-nair"
          }
        }
      ]
    },
    {
      "$type": "Row",
      "$key": "speaker-2",
      "justify": "between",
      "align": "center",
      "children": [
        {
          "$type": "Row",
          "$key": "info",
          "align": "center",
          "children": [
            {
              "$type": "Image",
              "$key": "avatar",
              "src": "https://i.pravatar.cc/150?img=33",
              "alt": "德文·布鲁克斯",
              "size": "sm",
              "round": true
            },
            {
              "$type": "Col",
              "$key": "text",
              "gap": 0,
              "children": [
                {
                  "$type": "Text",
                  "$key": "name",
                  "value": "德文·布鲁克斯",
                  "weight": "medium"
                },
                {
                  "$type": "Caption",
                  "$key": "title",
                  "value": "Agentbase 创始工程师"
                }
              ]
            }
          ]
        },
        {
          "$type": "Button",
          "$key": "view",
          "label": "查看",
          "buttonStyle": "outline",
          "$action": {
            "type": "view_speaker",
            "speakerId": "devon-brooks"
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
