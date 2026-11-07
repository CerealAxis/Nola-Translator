import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/styles/base-nova/ui/accordion"

export default function AccordionDisabled() {
  return (
    <Accordion className="w-full">
      <AccordionItem value="item-1">
        <AccordionTrigger>我可以查看账户历史记录吗？</AccordionTrigger>
        <AccordionContent>
          你可以在控制面板的“账户历史记录”中查看完整记录，包括所有交易、方案变更和支持工单。
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2" disabled>
        <AccordionTrigger>高级功能说明</AccordionTrigger>
        <AccordionContent>
          此部分介绍高级功能。升级方案即可查看这些内容。
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>如何更新我的电子邮箱地址？</AccordionTrigger>
        <AccordionContent>
          你可以在账户设置中更新邮箱。我们会向新邮箱发送验证邮件以确认更改。
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
