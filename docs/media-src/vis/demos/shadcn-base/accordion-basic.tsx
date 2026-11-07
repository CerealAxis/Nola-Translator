import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/styles/base-nova/ui/accordion"

const items = [
  {
    value: "item-1",
    trigger: "如何重置密码？",
    content:
      "在登录页面点击“忘记密码”，输入邮箱后，我们会发送密码重置链接。链接将在 24 小时后失效。",
  },
  {
    value: "item-2",
    trigger: "我可以更改订阅方案吗？",
    content: "你可以随时在账户设置中升级或降级方案，更改会在下一个账单周期生效。",
  },
  {
    value: "item-3",
    trigger: "你们支持哪些支付方式？",
    content: "我们支持主流信用卡、PayPal 和银行转账。所有付款均通过支付合作方安全处理。",
  },
]

export function AccordionBasic() {
  return (
    <Accordion defaultValue={["item-1"]} className="max-w-lg">
      {items.map((item) => (
        <AccordionItem key={item.value} value={item.value}>
          <AccordionTrigger>{item.trigger}</AccordionTrigger>
          <AccordionContent>{item.content}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
