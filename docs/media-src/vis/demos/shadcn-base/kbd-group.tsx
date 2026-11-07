import { Kbd, KbdGroup } from "@/styles/base-nova/ui/kbd"

export default function KbdGroupExample() {
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-muted-foreground">
        使用{" "}
        <KbdGroup>
          <Kbd>Ctrl + B</Kbd>
          <Kbd>Ctrl + K</Kbd>
        </KbdGroup>{" "}
        以打开命令面板
      </p>
    </div>
  )
}
