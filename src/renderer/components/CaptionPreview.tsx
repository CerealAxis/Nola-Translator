import { ChevronDownRegular, DesktopRegular, DismissRegular, LockOpenRegular, MicRegular, MoreHorizontalRegular, PinRegular, StopRegular, SubtractRegular } from '@fluentui/react-icons'
import type { CaptionSegment } from '../../shared/contracts'
import { DEFAULT_SETTINGS, type OverlaySettings } from '../../shared/settings'
import { shortLanguageLabel, translationProviderLabel } from '../session'
import { failedTranslations, translationErrorLabel } from './translation-status'
import { useI18n } from '../i18n'

type CaptionPreviewProps = {
  listening?: boolean
  sourceVisible?: boolean
  translationVisible?: boolean
  caption?: CaptionSegment | null
  modelProgress?: number | null
  sourceLanguage?: string
  targetLanguage?: string
  overlay?: Pick<OverlaySettings, 'fontFamily' | 'backgroundOpacity' | 'backgroundColor' | 'colorScheme' | 'sourceColor' | 'translationColor' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'translationFontSize' | 'translationFontWeight' | 'translationLineHeight'>
}

export function CaptionPreview({
  listening = false,
  sourceVisible = true,
  translationVisible = true,
  caption = null,
  modelProgress: _modelProgress = null,
  sourceLanguage = DEFAULT_SETTINGS.recognition.sourceLanguage,
  targetLanguage = DEFAULT_SETTINGS.translation.targetLanguage,
  overlay = DEFAULT_SETTINGS.overlay,
}: CaptionPreviewProps): React.JSX.Element {
  const { t } = useI18n()
  const completeTranslations = caption?.translations.filter((item) => item.state === 'complete' && item.text) ?? []
  const failed = failedTranslations(caption)

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
            '--preview-line-height': `${overlay.lineHeight}`,
            '--preview-translation-font-size': `${overlay.translationFontSize}px`,
            '--preview-translation-font-weight': overlay.translationFontWeight,
            '--preview-translation-line-height': `${overlay.translationLineHeight}`,
          } as React.CSSProperties}
        >
          <div className="caption-preview-text">
            {sourceVisible && <p className="caption-source">{caption?.sourceText || (listening ? t('正在识别语音…') : t('开始会话后，识别原文会显示在这里。'))}</p>}
            {translationVisible && completeTranslations.map((translation) => <p className="caption-translation" key={translation.targetLanguage}>{translation.text!}</p>)}
            {translationVisible && failed.map((translation) => <p className="caption-translation caption-translation-failed" key={translation.targetLanguage}>{translationErrorLabel(t, translation)}</p>)}
          </div>
          <div className="caption-preview-scrim caption-preview-scrim-top" aria-hidden="true" />
          <div className="caption-preview-scrim caption-preview-scrim-bottom" aria-hidden="true" />
          <div className="caption-preview-actions" aria-hidden="true"><DesktopRegular /><LockOpenRegular /><PinRegular /><i /><MoreHorizontalRegular /><SubtractRegular /><DismissRegular /></div>
          <div className="caption-preview-controls" aria-hidden="true">
            <span className="caption-preview-mic">{listening ? <StopRegular /> : <MicRegular />}</span>
            <span className="caption-preview-pill">{translationProviderLabel(DEFAULT_SETTINGS.translation.provider)}<ChevronDownRegular /></span>
            <span className="caption-preview-pill">{shortLanguageLabel(sourceLanguage)} → {shortLanguageLabel(targetLanguage)}</span>
            <span className="caption-preview-pill">{sourceVisible && translationVisible ? t('双语') : sourceVisible ? t('原文') : t('译文')}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
