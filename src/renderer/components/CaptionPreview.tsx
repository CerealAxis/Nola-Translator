import type { CaptionSegment } from '../../shared/contracts'
import { DEFAULT_SETTINGS, type OverlaySettings } from '../../shared/settings'

type CaptionPreviewProps = {
  listening?: boolean
  sourceVisible?: boolean
  translationVisible?: boolean
  caption?: CaptionSegment | null
  modelProgress?: number | null
  overlay?: Pick<OverlaySettings, 'backgroundOpacity' | 'backgroundColor' | 'colorScheme' | 'sourceColor' | 'translationColor' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'maxLines' | 'translationFontSize' | 'translationFontWeight' | 'translationLineHeight' | 'translationMaxLines'>
}

export function CaptionPreview({
  listening = false,
  sourceVisible = true,
  translationVisible = true,
  caption = null,
  modelProgress: _modelProgress = null,
  overlay = DEFAULT_SETTINGS.overlay,
}: CaptionPreviewProps): React.JSX.Element {
  const completeTranslations = caption?.translations.filter((item) => item.state === 'complete') ?? []

  return (
    <section className="preview-section" aria-label="字幕浮层预览">
      <div className="section-heading-row">
        <h2>字幕浮层预览</h2>
        <span className="secondary-text">仅显示原文与译文</span>
      </div>
      <div className="preview-stage">
        <div
          className="caption-overlay"
          data-color-scheme={overlay.colorScheme}
          data-transparent-background={overlay.backgroundOpacity <= 0}
          style={{
            '--preview-background-alpha': `${overlay.backgroundOpacity * 100}%`,
            '--preview-background-color': overlay.backgroundColor,
            '--preview-source-color': overlay.sourceColor,
            '--preview-translation-color': overlay.translationColor,
            '--preview-font-size': `${overlay.fontSize}px`,
            '--preview-font-weight': overlay.fontWeight,
            '--preview-line-height': overlay.lineHeight,
            '--preview-max-lines': overlay.maxLines,
            '--preview-translation-font-size': `${overlay.translationFontSize}px`,
            '--preview-translation-font-weight': overlay.translationFontWeight,
            '--preview-translation-line-height': overlay.translationLineHeight,
            '--preview-translation-max-lines': overlay.translationMaxLines,
          } as React.CSSProperties}
        >
          {sourceVisible && (
            <p className="caption-source">{caption?.sourceText || (listening ? '正在识别语音…' : '开始会话后，识别原文会显示在这里。')}</p>
          )}
          {translationVisible && completeTranslations.map((translation) => (
            <p className="caption-translation" key={translation.targetLanguage}>{translation.text}</p>
          ))}
        </div>
      </div>
    </section>
  )
}
