import { LockClosedRegular } from '@fluentui/react-icons'

type CaptionPreviewProps = {
  listening?: boolean
  sourceVisible?: boolean
  translationVisible?: boolean
}

export function CaptionPreview({
  listening = false,
  sourceVisible = true,
  translationVisible = true
}: CaptionPreviewProps): React.JSX.Element {
  return (
    <section className="preview-section" aria-label="字幕浮层预览">
      <div className="section-heading-row">
        <h2>字幕浮层预览</h2>
        <span className="secondary-text">底部 · 已置顶 · 点击穿透</span>
      </div>
      <div className="preview-stage">
        <div className="caption-overlay">
          <div className="caption-meta">
            <span className="caption-state">
              <span className="status-dot" aria-hidden="true" />
              {listening ? '正在识别' : '演示字幕'}
            </span>
            <span className="caption-position">
              <LockClosedRegular aria-hidden /> English → 简体中文
            </span>
          </div>
          {sourceVisible && <p className="caption-source">Everything happens locally on your device.</p>}
          {translationVisible && (
            <p className="caption-translation">所有处理都在你的设备上本地完成。</p>
          )}
        </div>
      </div>
    </section>
  )
}
