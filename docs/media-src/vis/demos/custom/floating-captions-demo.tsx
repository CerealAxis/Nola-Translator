import { DEFAULT_SETTINGS } from '@/bridge'
import { OverlayCaptionPreview } from '@/features/overlay/OverlayCaptionPreview'
import '../../shadcn-base/apple-liquid-glass.css'
import '../../shadcn-base/nola-liquid-glass.css'
import '@/theme/app.css'
import '@/theme/caption-card.css'

export default function FloatingCaptionsDemo() {
  return (
    <div className="nola-component-demo nola-overlay-page">
      <OverlayCaptionPreview config={{ ...DEFAULT_SETTINGS.overlay, layout: 'sentence' }} />
    </div>
  )
}
