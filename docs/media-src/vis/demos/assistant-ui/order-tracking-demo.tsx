import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "title": "订单 #48213",
  "children": [
    {
      "$type": "Alert",
      "$key": "alert",
      "tone": "success",
      "title": "订单已确认",
      "description": "包裹正在配送，预计今天送达。"
    },
    {
      "$type": "ListView",
      "$key": "timeline",
      "children": [
        {
          "$type": "ListViewItem",
          "$key": "placed",
          "$action": {
            "type": "view_order_event",
            "eventId": "placed"
          },
          "children": {
            "$type": "Row",
            "justify": "between",
            "children": [
              {
                "$type": "Col",
                "$key": "label",
                "gap": 1,
                "children": [
                  {
                    "$type": "Text",
                    "$key": "title",
                    "value": "已下单",
                    "weight": "medium"
                  },
                  {
                    "$type": "Caption",
                    "$key": "time",
                    "value": "今天 09:02"
                  }
                ]
              },
              {
                "$type": "Badge",
                "$key": "badge",
                "value": "完成",
                "variant": "success"
              }
            ]
          }
        },
        {
          "$type": "ListViewItem",
          "$key": "packed",
          "$action": {
            "type": "view_order_event",
            "eventId": "packed"
          },
          "children": {
            "$type": "Row",
            "justify": "between",
            "children": [
              {
                "$type": "Col",
                "$key": "label",
                "gap": 1,
                "children": [
                  {
                    "$type": "Text",
                    "$key": "title",
                    "value": "已打包",
                    "weight": "medium"
                  },
                  {
                    "$type": "Caption",
                    "$key": "time",
                    "value": "今天 09:41"
                  }
                ]
              },
              {
                "$type": "Badge",
                "$key": "badge",
                "value": "完成",
                "variant": "success"
              }
            ]
          }
        },
        {
          "$type": "ListViewItem",
          "$key": "transit",
          "$action": {
            "type": "view_order_event",
            "eventId": "transit"
          },
          "children": {
            "$type": "Row",
            "justify": "between",
            "children": [
              {
                "$type": "Col",
                "$key": "label",
                "gap": 1,
                "children": [
                  {
                    "$type": "Text",
                    "$key": "title",
                    "value": "配送中",
                    "weight": "medium"
                  },
                  {
                    "$type": "Caption",
                    "$key": "time",
                    "value": "预计 14:00 至 16:00"
                  }
                ]
              },
              {
                "$type": "Badge",
                "$key": "badge",
                "value": "进行中",
                "variant": "info"
              }
            ]
          }
        }
      ]
    },
    {
      "$type": "Divider",
      "$key": "divider"
    },
    {
      "$type": "Row",
      "$key": "actions",
      "justify": "end",
      "children": [
        {
          "$type": "Button",
          "$key": "track",
          "label": "查看物流",
          "buttonStyle": "outline",
          "$action": {
            "type": "track_order",
            "orderId": "48213"
          }
        },
        {
          "$type": "Button",
          "$key": "support",
          "label": "联系支持",
          "buttonStyle": "ghost",
          "$action": {
            "type": "contact_support",
            "orderId": "48213"
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
