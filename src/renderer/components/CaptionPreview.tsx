import { LockClosedRegular } from '@fluentui/react-icons'
import type { CaptionSegment } from '../../shared/contracts'

type CaptionPreviewProps = {
  listening?: boolean
  sourceVisible?: boolean
  translationVisible?: boolean
  caption?: CaptionSegment | null
  modelProgress?: number | null
}

export function CaptionPreview({
  listening = false,
  sourceVisible = true,
  translationVisible = true,
  caption = null,
  modelProgress = null
}: CaptionPreviewProps): React.JSX.Element {
  const completeTranslations = caption?.translations.filter((item) => item.state === 'complete') ?? []
  const hasPendingTranslation = caption?.translations.some((item) => item.state === 'pending')
  const failedTranslation = caption?.translations.find((item) => item.state === 'failed')

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
              {listening ? '正在识别' : '等待字幕'}
            </span>
            <span className="caption-position">
              <LockClosedRegular aria-hidden /> English → 简体中文
            </span>
          </div>
          {sourceVisible && (
            <p className="caption-source">{caption?.sourceText || '开始会话后，识别原文会显示在这里。'}</p>
          )}
          {translationVisible && completeTranslations.map((translation) => (
            <p className="caption-translation" key={translation.targetLanguage}>{translation.text}</p>
          ))}
          {translationVisible && hasPendingTranslation && (
            <p className="caption-translation secondary-text">正在准备本地翻译…</p>
          )}
          {translationVisible && failedTranslation && (
            <p className="caption-translation secondary-text">翻译暂不可用：{failedTranslation.errorCode}</p>
          )}
          {modelProgress !== null && modelProgress < 1 && (
            <p className="caption-translation secondary-text">正在准备模型 · {Math.round(modelProgress * 100)}%</p>
          )}
        </div>
      </div>
    </section>
  )
}
