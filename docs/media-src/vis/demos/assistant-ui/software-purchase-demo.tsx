import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "title": "购买专业版",
  "asForm": true,
  "confirm": {
    "label": "确认",
    "$action": {
      "type": "confirm_purchase"
    }
  },
  "cancel": {
    "label": "舍弃"
  },
  "children": [
    {
      "$type": "Input",
      "$key": "purpose",
      "name": "purpose",
      "label": "用途",
      "placeholder": "例如：工程团队"
    },
    {
      "$type": "Row",
      "$key": "dates",
      "gap": 3,
      "children": [
        {
          "$type": "DatePicker",
          "$key": "start",
          "name": "startDate",
          "label": "开始日期"
        },
        {
          "$type": "DatePicker",
          "$key": "end",
          "name": "endDate",
          "label": "续订日期"
        }
      ]
    },
    {
      "$type": "Row",
      "$key": "selects",
      "gap": 3,
      "children": [
        {
          "$type": "Select",
          "$key": "seats",
          "name": "seats",
          "label": "购买数量",
          "placeholder": "席位数",
          "options": [
            {
              "label": "5 个席位",
              "value": "5"
            },
            {
              "label": "10 个席位",
              "value": "10"
            },
            {
              "label": "25 个席位",
              "value": "25"
            },
            {
              "label": "50 个席位",
              "value": "50"
            }
          ]
        },
        {
          "$type": "Select",
          "$key": "frequency",
          "name": "frequency",
          "label": "结算频率",
          "placeholder": "选择结算频率",
          "options": [
            {
              "label": "按月",
              "value": "monthly"
            },
            {
              "label": "按年",
              "value": "annual"
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
      "$type": "Fact",
      "$key": "total",
      "label": "总金额",
      "value": "每月 125 美元"
    }
  ]
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
