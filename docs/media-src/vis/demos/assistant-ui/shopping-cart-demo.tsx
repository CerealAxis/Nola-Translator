import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "title": "购物车",
  "children": [
    {
      "$type": "ListView",
      "$key": "items",
      "children": [
        {
          "$type": "ListViewItem",
          "$key": "item-1",
          "children": {
            "$type": "Row",
            "justify": "between",
            "children": [
              {
                "$type": "Text",
                "$key": "name",
                "value": "无线耳机"
              },
              {
                "$type": "Caption",
                "$key": "price",
                "value": "$79.00"
              }
            ]
          }
        },
        {
          "$type": "ListViewItem",
          "$key": "item-2",
          "children": {
            "$type": "Row",
            "justify": "between",
            "children": [
              {
                "$type": "Text",
                "$key": "name",
                "value": "USB-C 数据线（2 米）"
              },
              {
                "$type": "Caption",
                "$key": "price",
                "value": "$12.00"
              }
            ]
          }
        },
        {
          "$type": "ListViewItem",
          "$key": "item-3",
          "children": {
            "$type": "Row",
            "justify": "between",
            "children": [
              {
                "$type": "Text",
                "$key": "name",
                "value": "手机保护壳"
              },
              {
                "$type": "Caption",
                "$key": "price",
                "value": "$18.00"
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
      "$key": "totals",
      "justify": "between",
      "children": [
        {
          "$type": "Fact",
          "$key": "subtotal",
          "label": "小计",
          "value": "$109.00"
        },
        {
          "$type": "Fact",
          "$key": "tax",
          "label": "税费",
          "value": "$9.81"
        },
        {
          "$type": "Fact",
          "$key": "total",
          "label": "总计",
          "value": "$118.81"
        }
      ]
    },
    {
      "$type": "Row",
      "$key": "actions",
      "justify": "end",
      "children": [
        {
          "$type": "Button",
          "$key": "add",
          "label": "加入购物车",
          "buttonStyle": "outline",
          "$action": {
            "type": "add_to_cart"
          }
        },
        {
          "$type": "Button",
          "$key": "purchase",
          "label": "购买",
          "buttonStyle": "primary",
          "$action": {
            "type": "purchase_cart"
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
