import { Button } from "@/styles/base-nova/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/styles/base-nova/ui/field"
import { Input } from "@/styles/base-nova/ui/input"

export function FieldResponsive() {
  return (
    <div className="w-full max-w-lg">
      <form>
        <FieldSet>
          <FieldLegend>个人资料</FieldLegend>
          <FieldDescription>填写个人资料。</FieldDescription>
          <FieldGroup>
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor="name">名称</FieldLabel>
                <FieldDescription>
                  提供你的姓名以供识别
                </FieldDescription>
              </FieldContent>
              <Input id="name" placeholder="小兔子" required />
            </Field>
            <Field orientation="responsive">
              <Button type="submit">提交</Button>
              <Button type="button" variant="outline">
                取消
              </Button>
            </Field>
          </FieldGroup>
        </FieldSet>
      </form>
    </div>
  )
}
