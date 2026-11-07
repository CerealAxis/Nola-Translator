import { useEffect, useId, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectGroup, SelectItem, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { closeToast, showToast, ToastProvider } from '@/components/ui/toast';
import './WritingExamples.css';

export function WritingFields() {
  const id = useId();

  return (
    <div className="foundation-board" data-writing-scene="fields" inert>
      <div className="writing-field-pair">
        <figure>
          <figcaption>输入前</figcaption>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-empty`}>文件名称</FieldLabel>
              <Input id={`${id}-empty`} placeholder="例如：周末访谈" readOnly aria-describedby={`${id}-empty-hint`} />
              <FieldDescription id={`${id}-empty-hint`}>无需填写扩展名。</FieldDescription>
            </Field>
          </FieldGroup>
        </figure>
        <figure>
          <figcaption>输入后</figcaption>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-filled`}>文件名称</FieldLabel>
              <Input id={`${id}-filled`} value="读书分享" readOnly aria-describedby={`${id}-filled-hint`} />
              <FieldDescription id={`${id}-filled-hint`}>无需填写扩展名。</FieldDescription>
            </Field>
          </FieldGroup>
        </figure>
      </div>
    </div>
  );
}

export function WritingActions() {
  const id = useId();

  return (
    <div className="foundation-board" data-writing-scene="actions" inert>
      <div className="writing-action-flow">
        <div className="writing-action-entry"><Button variant="outline">导出字幕</Button></div>
        <ArrowRight className="writing-action-arrow" aria-hidden="true" />
        <Dialog open={false}>
          <Card className="writing-dialog" role="dialog" aria-labelledby={`${id}-title`}>
            <DialogHeader><DialogTitle id={`${id}-title`}>导出字幕</DialogTitle></DialogHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`${id}-format`}>格式</FieldLabel>
                  <Select value="srt">
                    <SelectTrigger id={`${id}-format`}><SelectValue>SubRip (.srt)</SelectValue></SelectTrigger>
                    <SelectContent><SelectGroup><SelectItem value="srt">SubRip (.srt)</SelectItem></SelectGroup></SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            </CardContent>
            <DialogFooter><Button variant="outline">取消</Button><Button>导出</Button></DialogFooter>
          </Card>
        </Dialog>
      </div>
    </div>
  );
}

export function WritingRecovery() {
  const toastId = useRef<string | undefined>(undefined);

  useEffect(() => () => {
    if (toastId.current) closeToast(toastId.current);
  }, []);

  function showFailure() {
    if (toastId.current) closeToast(toastId.current);
    const id: string = showToast({
      type: 'error',
      title: '语音识别模型下载中断',
      description: '网络连接已断开。连接恢复后重试。',
      actionProps: { children: '重试下载', onClick: () => closeToast(id) },
      duration: 12000,
    });
    toastId.current = id;
  }

  return (
    <div className="foundation-board writing-toast-example" data-writing-scene="recovery">
      <Button variant="outline" onClick={showFailure}>显示错误通知</Button>
      <ToastProvider />
    </div>
  );
}
