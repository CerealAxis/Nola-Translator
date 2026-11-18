export function ImageGeneration({ label }: { label?: string }) {
  return (
    <div
      data-slot="image-generation"
      className="absolute inset-0 bg-card"
      role={label ? 'status' : undefined}
      aria-label={label}
    >
      <div aria-hidden="true" className="image-generation__grid" />
    </div>
  )
}
