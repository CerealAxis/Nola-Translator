import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Form",
  "$action": {
    "type": "create_task"
  },
  "children": [
    {
      "$type": "Input",
      "$key": "title",
      "name": "title",
      "label": "标题",
      "placeholder": "输入任务标题"
    },
    {
      "$type": "Input",
      "$key": "description",
      "name": "description",
      "label": "说明",
      "multiline": true,
      "placeholder": "补充任务细节…"
    },
    {
      "$type": "DatePicker",
      "$key": "due",
      "name": "dueDate",
      "label": "截止日期"
    },
    {
      "$type": "Button",
      "$key": "create",
      "label": "创建任务",
      "buttonStyle": "primary",
      "block": true,
      "submit": true
    }
  ]
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
