import { Marker, MarkerContent } from "@/styles/base-rhea/ui/marker"

export function MarkerShimmerDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8 py-12">
      <Marker role="status">
        <MarkerContent className="shimmer">正在思考……</MarkerContent>
      </Marker>
      <Marker variant="separator" role="status">
        <MarkerContent className="shimmer">正在读取 4 个文件</MarkerContent>
      </Marker>
    </div>
  )
}
