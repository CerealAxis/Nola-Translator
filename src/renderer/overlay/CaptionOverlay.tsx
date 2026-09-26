import { useEffect, useState } from 'react'

import type { CaptionSegment, EngineEvent } from '../../shared/contracts'
import { DEFAULT_SETTINGS, type AppSettings } from '../../shared/settings'

export function CaptionOverlay(): React.JSX.Element {
  const [segments, setSegments] = useState<CaptionSegment[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    document.documentElement.dataset.overlay = 'true'
    const api = window.fluentCaptions
    if (!api) return
    void api.getSettings().then(setSettings)
    const unsubscribeSettings = api.onSettingsChanged(setSettings)
    const unsubscribeEvents = api.onEngineEvent((event: EngineEvent) => {
      if (event.type === 'caption') {
        setSegments((current) => {
          const index = current.findIndex((item) => item.segmentId === event.segment.segmentId)
          const next = [...current]
          if (index >= 0) {
            if (next[index].revision > event.segment.revision) return current
            next[index] = event.segment
          } else {
            next.push(event.segment)
          }
          return next.slice(-10)
        })
      } else if (event.type === 'sessionStarted') {
        setSegments([])
      }
    })
    return () => { unsubscribeSettings(); unsubscribeEvents() }
  }, [])

  const visibleSegments = segments.slice(-settings.overlay.maxLines)
  return (
    <main
      className="overlay-window"
      data-adjusting={!settings.overlay.locked}
    >
      <section
        className="standalone-overlay"
        data-locked={settings.overlay.locked}
        data-color-scheme={settings.overlay.colorScheme}
        data-transparent-background={settings.overlay.backgroundOpacity <= 0}
        aria-live="polite"
        style={{
          '--overlay-background-alpha': `${settings.overlay.backgroundOpacity * 100}%`,
          '--overlay-background-color': settings.overlay.backgroundColor,
          '--overlay-source-color': settings.overlay.sourceColor,
          '--overlay-translation-color': settings.overlay.translationColor,
          '--overlay-font-size': `${settings.overlay.fontSize}px`,
          '--overlay-font-weight': settings.overlay.fontWeight,
          '--overlay-line-height': settings.overlay.lineHeight,
          '--overlay-max-lines': settings.overlay.maxLines,
          '--overlay-translation-font-size': `${settings.overlay.translationFontSize}px`,
          '--overlay-translation-font-weight': settings.overlay.translationFontWeight,
          '--overlay-translation-line-height': settings.overlay.translationLineHeight,
          '--overlay-translation-max-lines': settings.overlay.translationMaxLines,
          fontFamily: settings.overlay.fontFamily,
        } as React.CSSProperties}
        >
        <div className="overlay-lines">
          {visibleSegments.length === 0 && settings.overlay.showSource && <p className="overlay-source">开始字幕后，原文会显示在这里。</p>}
            {visibleSegments.map((segment, index) => (
              <section className="overlay-caption-row" key={index}>
              {settings.overlay.showSource && <p className="overlay-source">{segment.sourceText}</p>}
              {settings.overlay.showTranslation && segment.translations
                .filter((translation) => translation.state === 'complete' && translation.text)
                .map((translation) => <p className="overlay-translation" key={translation.targetLanguage}>{translation.text}</p>)}
            </section>
          ))}
        </div>
      </section>
    </main>
  )
}
