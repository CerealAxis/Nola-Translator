import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/styles/base-nova/ui/accordion"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/styles/base-nova/ui/card"

const items = [
  {
    value: "plans",
    trigger: "你们提供哪些订阅方案？",
    content:
      "我们提供三个订阅等级：入门版（$9/月）、专业版（$29/月）和企业版（$99/月）。各方案提供不同的存储空间，并包含 API 访问、优先支持和团队协作功能。",
  },
  {
    value: "billing",
    trigger: "账单如何计算？",
    content:
      "每个账单周期开始时会自动扣款。企业客户可使用主流信用卡、PayPal 和 ACH 转账。每次付款后都会收到邮件发票。",
  },
  {
    value: "cancel",
    trigger: "如何取消订阅？",
    content: "你可以随时在账户设置中取消订阅，无需支付取消费用。当前账单周期结束前，你仍可继续使用服务。",
  },
]

export default function AccordionCard() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>订阅与账单</CardTitle>
        <CardDescription>
          关于账户、方案、付款和取消订阅的常见问题。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion defaultValue={["plans"]}>
          {items.map((item) => (
            <AccordionItem key={item.value} value={item.value}>
              <AccordionTrigger>{item.trigger}</AccordionTrigger>
              <AccordionContent>{item.content}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  )
}
