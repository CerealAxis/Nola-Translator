import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/styles/base-nova/ui/accordion"

export default function AccordionDemo() {
  return (
    <Accordion defaultValue={["shipping"]} className="max-w-lg">
      <AccordionItem value="shipping">
        <AccordionTrigger>有哪些配送方式？</AccordionTrigger>
        <AccordionContent>
          我们提供标准配送（5–7 天）、加急配送（2–3 天）和隔夜配送。国际订单免运费。
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="returns">
        <AccordionTrigger>退货政策是什么？</AccordionTrigger>
        <AccordionContent>
          商品可在 30 天内退货，须保持未使用状态并保留原包装。退款将在 5–7 个工作日内处理。
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="support">
        <AccordionTrigger>如何联系客户支持？</AccordionTrigger>
        <AccordionContent>
          你可以通过邮件、在线聊天或电话联系我们。我们会在工作日的 24 小时内回复。
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
