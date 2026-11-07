import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "children": [
    {
      "$type": "Row",
      "$key": "meta",
      "justify": "between",
      "children": [
        {
          "$type": "Caption",
          "$key": "channel",
          "value": "#产品更新"
        },
        {
          "$type": "Caption",
          "$key": "timestamp",
          "value": "今天 14:14"
        }
      ]
    },
    {
      "$type": "Row",
      "$key": "author-row",
      "align": "center",
      "children": [
        {
          "$type": "Image",
          "$key": "avatar",
          "src": "https://i.pravatar.cc/150?img=12",
          "alt": "李乔",
          "size": "sm",
          "round": true
        },
        {
          "$type": "Text",
          "$key": "author",
          "value": "李乔",
          "weight": "semibold"
        }
      ]
    },
    {
      "$type": "Markdown",
      "$key": "body",
      "value": "本周将上线三项改进：\n\n1. 整个工作区的**搜索速度更快**\n2. 移动应用支持**深色模式**\n3. 更新了**首次使用引导**\n\n欢迎告诉我们你的感受！"
    }
  ]
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
