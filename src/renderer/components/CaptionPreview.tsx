import { CaptionText } from './CaptionText'
import type { CaptionSegment } from '../../shared/contracts'
import { DEFAULT_SETTINGS, type OverlaySettings } from '../../shared/settings'
import { useI18n } from '../i18n'

type CaptionPreviewProps = {
  listening?: boolean
  sourceVisible?: boolean
  translationVisible?: boolean
  caption?: CaptionSegment | null
  modelProgress?: number | null
  overlay?: Pick<OverlaySettings, 'fontFamily' | 'backgroundOpacity' | 'backgroundColor' | 'colorScheme' | 'sourceColor' | 'translationColor' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'maxLines' | 'translationFontSize' | 'translationFontWeight' | 'translationLineHeight' | 'translationMaxLines'>
}

export function CaptionPreview({
  listening = false,
  sourceVisible = true,
  translationVisible = true,
  caption = null,
  modelProgress: _modelProgress = null,
  overlay = DEFAULT_SETTINGS.overlay,
}: CaptionPreviewProps): React.JSX.Element {
  const { t } = useI18n()
  const completeTranslations = caption?.translations.filter((item) => item.state === 'complete' && item.text) ?? []

  return (
    <section className="preview-section" aria-label={t('字幕浮层预览')}>
      <div className="section-heading-row">
        <h2>{t('字幕浮层预览')}</h2>
        <span className="secondary-text">{t('仅显示原文与译文')}</span>
      </div>
      <div className="preview-stage">
        <div
          className="caption-overlay"
          data-color-scheme={overlay.colorScheme}
          data-transparent-background={overlay.backgroundOpacity <= 0}
          style={{
            fontFamily: overlay.fontFamily,
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
            <CaptionText className="caption-source">{caption?.sourceText || (listening ? t('正在识别语音…') : t('开始会话后，识别原文会显示在这里。'))}</CaptionText>
          )}
          {translationVisible && completeTranslations.map((translation) => (
            <CaptionText className="caption-translation" key={translation.targetLanguage}>{translation.text!}</CaptionText>
          ))}
        </div>
      </div>
    </section>
  )
}
