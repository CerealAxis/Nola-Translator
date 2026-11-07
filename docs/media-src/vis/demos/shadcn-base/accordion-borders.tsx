import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/styles/base-nova/ui/accordion"

const items = [
  {
    value: "billing",
    trigger: "账单如何计算？",
    content:
      "我们提供月付和年付方案，每个周期开始时扣款，且可随时取消。所有方案均包含自动备份、全天候支持和不限人数的团队协作。",
  },
  {
    value: "security",
    trigger: "我的数据安全吗？",
    content:
      "是的。我们采用端到端加密、符合 SOC 2 Type II 标准，并定期接受第三方安全审计。所有静态和传输中的数据均使用行业标准协议加密。",
  },
  {
    value: "integration",
    trigger: "支持哪些集成？",
    content:
      "我们集成了 500 多种常用工具，包括 Slack、Zapier、Salesforce 和 HubSpot。你也可以使用 REST API 和 Webhook 构建自定义集成。",
  },
]

export default function AccordionBorders() {
  return (
    <Accordion
      className="max-w-lg rounded-lg border"
      defaultValue={["billing"]}
    >
      {items.map((item) => (
        <AccordionItem
          key={item.value}
          value={item.value}
          className="border-b px-4 last:border-b-0"
        >
          <AccordionTrigger>{item.trigger}</AccordionTrigger>
          <AccordionContent>{item.content}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
