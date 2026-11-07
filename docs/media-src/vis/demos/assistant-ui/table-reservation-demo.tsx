import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "asForm": true,
  "confirm": {
    "label": "确认订位",
    "$action": {
      "type": "book_reservation"
    }
  },
  "cancel": {
    "label": "取消"
  },
  "children": [
    {
      "$type": "Header",
      "$key": "title",
      "text": "预订餐桌",
      "size": "md"
    },
    {
      "$type": "Text",
      "$key": "intro",
      "value": "餐桌将保留至预约时间后 15 分钟。",
      "size": "sm",
      "color": "secondary"
    },
    {
      "$type": "Input",
      "$key": "name",
      "name": "guestName",
      "label": "姓名",
      "placeholder": "请输入姓名"
    },
    {
      "$type": "Select",
      "$key": "party",
      "name": "partySize",
      "label": "用餐人数",
      "placeholder": "选择用餐人数",
      "options": [
        {
          "label": "1 位",
          "value": "1"
        },
        {
          "label": "2 位",
          "value": "2"
        },
        {
          "label": "3 位",
          "value": "3"
        },
        {
          "label": "4 位及以上",
          "value": "4"
        }
      ]
    },
    {
      "$type": "DatePicker",
      "$key": "date",
      "name": "date",
      "label": "日期"
    },
    {
      "$type": "RadioGroup",
      "$key": "seating",
      "name": "seating",
      "label": "座位偏好",
      "defaultValue": "indoor",
      "options": [
        {
          "label": "室内",
          "value": "indoor"
        },
        {
          "label": "露台",
          "value": "patio"
        }
      ]
    },
    {
      "$type": "Checkbox",
      "$key": "reminder",
      "name": "reminder",
      "label": "提前 1 小时提醒"
    }
  ]
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
