import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/styles/base-nova/ui/accordion"

const items = [
  {
    value: "notifications",
    trigger: "通知设置",
    content: "管理通知接收方式。你可以开启更新邮件提醒或移动设备推送通知。",
  },
  {
    value: "privacy",
    trigger: "隐私与安全",
    content: "管理隐私设置和安全偏好。你可以启用双重验证、管理已连接设备、查看活动会话并配置数据共享偏好，也可以下载数据或删除账户。",
  },
  {
    value: "billing",
    trigger: "账单与订阅",
    content: "查看当前方案、付款记录和待开具的发票。你可以更新付款方式、更改订阅级别或取消订阅。",
  },
]

export function AccordionMultiple() {
  return (
    <Accordion multiple className="max-w-lg" defaultValue={["notifications"]}>
      {items.map((item) => (
        <AccordionItem key={item.value} value={item.value}>
          <AccordionTrigger>{item.trigger}</AccordionTrigger>
          <AccordionContent>{item.content}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
