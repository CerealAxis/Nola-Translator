import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Accordion() {
  return (
    <div className="vis-example vis-example--accordion">
      <Card className="vis-example__card">
        <CardHeader><CardTitle>高级字幕设置</CardTitle></CardHeader>
        <CardContent>
          <AccordionPrimitive.Root className="vis-example__accordion" defaultValue={['display']}>
            <AccordionPrimitive.Item value="display" className="vis-example__accordion-item">
              <AccordionPrimitive.Header>
                <AccordionPrimitive.Trigger className="vis-example__accordion-trigger">显示方式<ChevronDown aria-hidden="true" /></AccordionPrimitive.Trigger>
              </AccordionPrimitive.Header>
              <AccordionPrimitive.Panel className="vis-example__accordion-panel">原文与译文上下排列，保持句对可追踪。</AccordionPrimitive.Panel>
            </AccordionPrimitive.Item>
            <AccordionPrimitive.Item value="background" className="vis-example__accordion-item">
              <AccordionPrimitive.Header>
                <AccordionPrimitive.Trigger className="vis-example__accordion-trigger">字幕衬底<ChevronDown aria-hidden="true" /></AccordionPrimitive.Trigger>
              </AccordionPrimitive.Header>
              <AccordionPrimitive.Panel className="vis-example__accordion-panel">复杂画面上使用不透明衬底，保证字幕可读。</AccordionPrimitive.Panel>
            </AccordionPrimitive.Item>
            <AccordionPrimitive.Item value="position" className="vis-example__accordion-item">
              <AccordionPrimitive.Header>
                <AccordionPrimitive.Trigger className="vis-example__accordion-trigger">显示位置<ChevronDown aria-hidden="true" /></AccordionPrimitive.Trigger>
              </AccordionPrimitive.Header>
              <AccordionPrimitive.Panel className="vis-example__accordion-panel">调整字幕窗位置时，避开画面中的关键信息。</AccordionPrimitive.Panel>
            </AccordionPrimitive.Item>
          </AccordionPrimitive.Root>
        </CardContent>
      </Card>
    </div>
  );
}
