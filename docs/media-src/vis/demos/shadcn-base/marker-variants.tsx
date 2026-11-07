import { Marker, MarkerContent } from "@/styles/base-rhea/ui/marker"

export function MarkerVariantsDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8 py-12">
      <Marker>
        <MarkerContent>用于行内备注的默认标记</MarkerContent>
      </Marker>
      <Marker variant="separator">
        <MarkerContent>分隔标记</MarkerContent>
      </Marker>
      <Marker variant="border">
        <MarkerContent>用于标记行边界</MarkerContent>
      </Marker>
    </div>
  )
}
