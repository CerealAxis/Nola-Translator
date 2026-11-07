import { Checkbox } from "@/styles/base-nova/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSet,
} from "@/styles/base-nova/ui/field"

export default function FieldGroupExample() {
  return (
    <FieldGroup className="w-full max-w-xs">
      <FieldSet>
        <FieldLabel>响应</FieldLabel>
        <FieldDescription>
          研究或图像生成等耗时请求完成后，ChatGPT 会通知你。
        </FieldDescription>
        <FieldGroup data-slot="checkbox-group">
          <Field orientation="horizontal">
            <Checkbox id="push" defaultChecked disabled />
            <FieldLabel htmlFor="push" className="font-normal">
              推送通知
            </FieldLabel>
          </Field>
        </FieldGroup>
      </FieldSet>
      <FieldSeparator />
      <FieldSet>
        <FieldLabel>任务</FieldLabel>
        <FieldDescription>
          你创建的任务有更新时接收通知。{" "}
          <a href="#">管理任务</a>
        </FieldDescription>
        <FieldGroup data-slot="checkbox-group">
          <Field orientation="horizontal">
            <Checkbox id="push-tasks" />
            <FieldLabel htmlFor="push-tasks" className="font-normal">
              推送通知
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="email-tasks" />
            <FieldLabel htmlFor="email-tasks" className="font-normal">
              邮件通知
            </FieldLabel>
          </Field>
        </FieldGroup>
      </FieldSet>
    </FieldGroup>
  )
}
