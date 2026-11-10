import { ArrowLeft, ArrowRight, Check, CircleCheck, CircleX } from 'lucide-react';
import { DirectionProvider } from '@base-ui/react/direction-provider';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SliderRoot, SliderControl, SliderTrack, SliderIndicator, SliderThumb } from '@/components/ui/slider';

export function KeyboardFocus() {
  const id = useId();
  const [name, setName] = useState('阅读笔记');
  const [saved, setSaved] = useState('');
  return <div className="foundation-board" data-scene="environment-focus">
    <form className="fe-focus" onSubmit={event => {
      event.preventDefault();
      setSaved(name);
    }}>
      <h3 className="fe-title">重命名笔记</h3>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={id}>笔记名称</FieldLabel>
          <Input id={id} value={name} required onChange={event => setName(event.target.value)} />
        </Field>
      </FieldGroup>
      <div className="fe-actions"><Button type="submit">保存名称</Button></div>
      <p className="fe-feedback" role="status">{saved ? `示例已保存：${saved}` : '按 Tab 移动焦点，按 Enter 保存。'}</p>
    </form>
  </div>;
}

function ReadingPanel({ rtl }: { rtl: boolean }) {
  const Back = rtl ? ArrowRight : ArrowLeft;
  return <section className="fe-direction-example">
    <h3 className="fe-example-label">{rtl ? 'RTL 界面' : 'LTR 界面'}</h3>
    <div className="fe-reader" dir={rtl ? 'rtl' : 'ltr'} lang={rtl ? 'ar' : 'en'}>
      <div className="fe-reader-toolbar"><Back aria-hidden="true" size={16} /><span>{rtl ? 'رجوع' : 'Back'}</span></div>
      <ul className="fe-short-list" aria-label={rtl ? 'ملاحظات' : 'Notes'}>
        <li><bdi>Weekend notes</bdi></li>
        <li><bdi>ملاحظات القراءة</bdi></li>
      </ul>
      <div className="fe-passage-pair">
        <div className="fe-passage">
          <span className="fe-language" lang="zh-CN">英文原文</span>
          <p dir="ltr" lang="en">The library stays open until 18:30. You can return books at the desk beside the entrance.</p>
        </div>
        <div className="fe-passage">
          <span className="fe-language" lang="zh-CN">阿拉伯文译文</span>
          <p dir="rtl" lang="ar">المكتبة مفتوحة حتى الساعة <bdi dir="ltr">18:30</bdi>. يمكنك إعادة الكتب إلى المكتب بجوار المدخل.</p>
        </div>
      </div>
    </div>
  </section>;
}

export function RtlPassages() {
  return <div className="foundation-board" data-scene="environment-rtl">
    <div className="fe-direction-grid"><ReadingPanel rtl={false} /><ReadingPanel rtl /></div>
  </div>;
}

export function StatusShapes() {
  return <div className="foundation-board" data-scene="environment-status">
    <div className="fe-status-pair">
      <figure><figcaption>仅使用颜色</figcaption><div className="fe-status-items"><span className="fe-status-dot fe-status-success" /><span className="fe-status-dot fe-status-error" /></div></figure>
      <figure><figcaption>增加形状与文字</figcaption><div className="fe-status-items"><span className="fe-status-success"><CircleCheck aria-hidden="true" />已连接</span><span className="fe-status-error"><CircleX aria-hidden="true" />连接中断</span></div></figure>
    </div>
  </div>;
}

export function DirectionControls() {
  return <div className="foundation-board" data-scene="environment-direction-controls">
    <div className="fe-direction-grid">{(['ltr', 'rtl'] as const).map(direction =>
      <section key={direction}>
        <h3 className="fe-example-label">{direction === 'ltr' ? 'LTR' : 'RTL'}</h3>
        <DirectionProvider direction={direction}>
          <div dir={direction}>
            <SliderRoot defaultValue={35} min={0} max={100} aria-label="范围示意">
              <SliderControl className="fe-slider-control"><SliderTrack><SliderIndicator /></SliderTrack><SliderThumb /></SliderControl>
            </SliderRoot>
            <div className="fe-scale"><span>0</span><span>100</span></div>
            <div className="fe-direction-tools">
              <Button variant="outline">{direction === 'ltr' ? <ArrowLeft data-icon="inline-start" /> : <ArrowRight data-icon="inline-start" />}返回</Button>
              <span><Check aria-hidden="true" />完成</span>
            </div>
          </div>
        </DirectionProvider>
      </section>
    )}</div>
  </div>;
}
