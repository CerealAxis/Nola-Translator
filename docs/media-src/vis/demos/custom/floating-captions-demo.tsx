import { DEFAULT_SETTINGS } from '@/bridge'
import { OverlayCaptionPreview } from '@/features/overlay/OverlayCaptionPreview'
import '../../demo.css'
import '@/theme/app.css'
import '@/theme/caption-card.css'

export default function FloatingCaptionsDemo() {
  return (
    <div className="nola-component-demo nola-overlay-page">
      <OverlayCaptionPreview config={{ ...DEFAULT_SETTINGS.overlay, layout: 'sentence' }} />
    </div>
  )
}
