import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "children": [
    {
      "$type": "Badge",
      "$key": "status",
      "value": "购买完成",
      "variant": "success",
      "children": {
        "$type": "Icon",
        "name": "check",
        "size": "sm"
      }
    },
    {
      "$type": "Row",
      "$key": "product",
      "gap": 3,
      "align": "center",
      "children": [
        {
          "$type": "Image",
          "$key": "thumb",
          "src": "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=640&q=80",
          "alt": "机械键盘",
          "size": "sm"
        },
        {
          "$type": "Col",
          "$key": "info",
          "gap": 0,
          "children": [
            {
              "$type": "Text",
              "$key": "title",
              "value": "段落轴机械键盘",
              "weight": "medium"
            },
            {
              "$type": "Caption",
              "$key": "qty",
              "value": "数量 1"
            }
          ]
        }
      ]
    },
    {
      "$type": "Divider",
      "$key": "divider"
    },
    {
      "$type": "Col",
      "$key": "facts",
      "gap": 2,
      "children": [
        {
          "$type": "Fact",
          "$key": "delivery",
          "label": "预计送达",
          "value": "7 月 29 日至 8 月 1 日"
        },
        {
          "$type": "Fact",
          "$key": "seller",
          "label": "卖家",
          "value": "北风供应商店"
        },
        {
          "$type": "Fact",
          "$key": "paid",
          "label": "已支付",
          "value": "$149.00"
        }
      ]
    },
    {
      "$type": "Button",
      "$key": "details",
      "label": "查看详情",
      "buttonStyle": "outline",
      "$action": {
        "type": "view_order_details"
      }
    }
  ]
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
