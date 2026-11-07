import { Separator } from "@/styles/base-nova/ui/separator"

export default function SeparatorDemo() {
  return (
    <div className="flex max-w-sm flex-col gap-4 text-sm">
      <div className="flex flex-col gap-1.5">
        <div className="leading-none font-medium">shadcn/ui</div>
        <div className="text-muted-foreground">
          设计系统的基础
        </div>
      </div>
      <Separator />
      <div>
        一组经过精心设计、可自定义、扩展和组合使用的组件。
      </div>
    </div>
  )
}
