import type { CSSProperties } from 'react'
import { AudioLines, Volume2 } from 'lucide-react'

const ringSizes = [78, 130, 182, 234]
const signalLevels = [6, 12, 8, 17, 10, 14, 6]

export function QuickInterpretationVisual() {
  return (
    <div className="nola-home-quick-visual">
      <div className="nola-home-quick-source">
        {/* Magic UI Ripple 的同心圆节拍，放在系统音源后面。 */}
        {ringSizes.map((size, index) => (
          <span key={size} className="nola-home-quick-ring" style={{
            '--ring-size': `${size}px`,
            '--ring-delay': `${index * 0.14}s`,
            '--ring-strength': 1 - index * 0.18,
          } as CSSProperties} />
        ))}
        <span className="nola-home-quick-source-icon"><Volume2 /></span>
      </div>
      <div className="nola-home-quick-caption">
        <div className="nola-home-quick-caption-meta">
          <span className="nola-home-quick-caption-label"><AudioLines size={15} />系统声音</span>
          <span className="nola-home-quick-meter">
            {signalLevels.map((height, index) => (
              <span key={index} style={{
                '--bar-size': `${height}px`,
                '--bar-delay': `${index * -0.12}s`,
              } as CSSProperties} />
            ))}
          </span>
        </div>
        <p lang="en">Could you share your screen?</p>
        <p>可以共享一下屏幕吗？</p>
      </div>
    </div>
  )
}
