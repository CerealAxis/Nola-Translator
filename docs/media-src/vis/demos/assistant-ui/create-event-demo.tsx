import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "confirm": {
    "label": "加入日历",
    "$action": {
      "type": "add_to_calendar"
    }
  },
  "cancel": {
    "label": "舍弃"
  },
  "children": [
    {
      "$type": "Row",
      "$key": "date-header",
      "gap": 3,
      "align": "center",
      "children": [
        {
          "$type": "Text",
          "$key": "day",
          "value": "24",
          "size": "3xl",
          "weight": "bold"
        },
        {
          "$type": "Col",
          "$key": "date-meta",
          "gap": 0,
          "children": [
            {
              "$type": "Text",
              "$key": "month",
              "value": "7 月",
              "weight": "semibold"
            },
            {
              "$type": "Caption",
              "$key": "weekday",
              "value": "星期五"
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
      "$key": "events",
      "gap": 3,
      "children": [
        {
          "$type": "Row",
          "$key": "event-1",
          "align": "center",
          "gap": 3,
          "children": [
            {
              "$type": "Box",
              "$key": "accent",
              "width": 3,
              "height": 32,
              "radius": "full",
              "background": "var(--primary)"
            },
            {
              "$type": "Col",
              "$key": "info",
              "gap": 0,
              "children": [
                {
                  "$type": "Text",
                  "$key": "title",
                  "value": "设计评审",
                  "weight": "medium"
                },
                {
                  "$type": "Caption",
                  "$key": "time",
                  "value": "09:00 至 09:30"
                }
              ]
            },
            {
              "$type": "Spacer",
              "$key": "spacer"
            },
            {
              "$type": "Badge",
              "$key": "tag",
              "value": "工作",
              "variant": "info"
            }
          ]
        },
        {
          "$type": "Row",
          "$key": "event-2",
          "align": "center",
          "gap": 3,
          "children": [
            {
              "$type": "Box",
              "$key": "accent",
              "width": 3,
              "height": 32,
              "radius": "full",
              "background": "var(--chart-4)"
            },
            {
              "$type": "Col",
              "$key": "info",
              "gap": 0,
              "children": [
                {
                  "$type": "Text",
                  "$key": "title",
                  "value": "与小周午餐",
                  "weight": "medium"
                },
                {
                  "$type": "Caption",
                  "$key": "time",
                  "value": "12:30 至 13:30"
                }
              ]
            },
            {
              "$type": "Spacer",
              "$key": "spacer"
            },
            {
              "$type": "Badge",
              "$key": "tag",
              "value": "个人",
              "variant": "warning"
            }
          ]
        },
        {
          "$type": "Row",
          "$key": "event-3",
          "align": "center",
          "gap": 3,
          "children": [
            {
              "$type": "Box",
              "$key": "accent",
              "width": 3,
              "height": 32,
              "radius": "full",
              "background": "var(--chart-2)"
            },
            {
              "$type": "Col",
              "$key": "info",
              "gap": 0,
              "children": [
                {
                  "$type": "Text",
                  "$key": "title",
                  "value": "飞往东京",
                  "weight": "medium"
                },
                {
                  "$type": "Caption",
                  "$key": "time",
                  "value": "18:45"
                }
              ]
            },
            {
              "$type": "Spacer",
              "$key": "spacer"
            },
            {
              "$type": "Badge",
              "$key": "tag",
              "value": "出行",
              "variant": "success"
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
