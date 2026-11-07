import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/styles/base-nova/ui/field"
import { RadioGroup, RadioGroupItem } from "@/styles/base-nova/ui/radio-group"

export default function FieldChoiceCard() {
  return (
    <FieldGroup className="w-full max-w-xs">
      <FieldSet>
        <FieldLegend variant="label">计算环境</FieldLegend>
        <FieldDescription>
          选择集群的计算环境。
        </FieldDescription>
        <RadioGroup defaultValue="kubernetes">
          <FieldLabel htmlFor="kubernetes-r2h">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Kubernetes</FieldTitle>
                <FieldDescription>
                  在 K8s 集群上运行 GPU 任务。
                </FieldDescription>
              </FieldContent>
              <RadioGroupItem value="kubernetes" id="kubernetes-r2h" />
            </Field>
          </FieldLabel>
          <FieldLabel htmlFor="vm-z4k">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>虚拟机</FieldTitle>
                <FieldDescription>
                  连接集群以运行 GPU 任务。
                </FieldDescription>
              </FieldContent>
              <RadioGroupItem value="vm" id="vm-z4k" />
            </Field>
          </FieldLabel>
        </RadioGroup>
      </FieldSet>
    </FieldGroup>
  )
}
