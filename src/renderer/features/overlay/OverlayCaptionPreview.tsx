import type { CSSProperties } from 'react'
import { ChevronDown, Lock, Mic, Minus, Monitor, MoreHorizontal, Pin, Square, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { OverlaySettings } from '@/bridge'
import { useI18n } from '@/i18n'
import { captionScrimColor } from './scrimColor'

interface OverlayCaptionPreviewProps {
  config: OverlaySettings
  translationDisabled?: boolean
  sessionActive?: boolean
}

export function OverlayCaptionPreview({
  config,
  translationDisabled = false,
  sessionActive = false,
}: OverlayCaptionPreviewProps) {
  const { t } = useI18n()
  const display = config.showSource && config.showTranslation ? 'both' : config.showSource ? 'source' : 'translation'
  const previewStyle = {
    '--preview-background-color': config.backgroundColor,
    '--preview-background-alpha': `${Math.round(config.backgroundOpacity * 100)}%`,
    '--preview-scrim-color': captionScrimColor(config.backgroundColor, config.backgroundOpacity, config.colorScheme === 'light' ? 'light' : 'dark'),
    '--preview-source-color': config.sourceColor,
    '--preview-translation-color': config.translationColor,
    '--preview-font-size': `${config.fontSize}px`,
    '--preview-font-weight': config.fontWeight,
    '--preview-line-height': config.lineHeight,
    '--preview-translation-font-size': `${config.translationFontSize}px`,
    '--preview-translation-font-weight': config.translationFontWeight,
    '--preview-translation-line-height': config.translationLineHeight,
  } as CSSProperties

  return (
    <Card className="nola-overlay-preview" data-onboarding="caption-preview" role="region" aria-label={t('shellUi.captionPreview')}>
      <CardContent className="nola-overlay-stage">
        <div
          className="nola-caption-preview"
          data-color-scheme={config.colorScheme}
          data-transparent-background={config.backgroundOpacity <= 0}
          style={previewStyle}
          aria-hidden="true"
        >
          <div className="nola-caption-preview__text">
            {translationDisabled || config.showSource ? <p className="nola-caption-preview__source">{t('modelsSettingsUi.previewSource')}</p> : null}
            {!translationDisabled && config.showTranslation ? <p className="nola-caption-preview__translation">{t('modelsSettingsUi.previewTranslation')}</p> : null}
            {!translationDisabled && !config.showSource && !config.showTranslation ? <p className="nola-caption-preview__source">{t('modelsSettingsUi.previewHidden')}</p> : null}
          </div>
          <div className="nola-caption-preview__scrim" data-edge="top" />
          <div className="nola-caption-preview__scrim" data-edge="bottom" />
          <div className="nola-caption-preview__actions">
            <Monitor /><Lock /><Pin /><i /><MoreHorizontal /><Minus /><X />
          </div>
          <div className="nola-caption-preview__controls">
            <span className="nola-caption-preview__mic">{sessionActive ? <Square /> : <Mic />}</span>
            {!translationDisabled && <>
              <span className="nola-caption-preview__pill">{t(display === 'both' ? 'workspace.modeBoth' : display === 'source' ? 'workspace.modeSource' : 'workspace.modeTranslation')}<ChevronDown /></span>
              <span className="nola-caption-preview__pill">{t(config.layout === 'rolling' ? 'workspace.layoutSplit' : 'workspace.layoutSentence')}<ChevronDown /></span>
            </>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
