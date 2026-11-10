import { useEffect, useState, type CSSProperties } from 'react'
import { useI18n } from '@/i18n'
import { stores, useStore } from '@/store'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import type { GameSnapshot, GameTranslationBridge } from '../../../shared/game-translation'
import { CaptionTrack } from '../overlay/CaptionTrack'

export function GameOverlay({ api, sessionId }: { api: Pick<GameTranslationBridge, 'snapshot' | 'onChanged'>; sessionId: string }) {
  const { t } = useI18n()
  const config = useStore(stores.settings, state => state.settings?.overlay) ?? DEFAULT_SETTINGS.overlay
  const [snapshot, setSnapshot] = useState<GameSnapshot>()
  useEffect(() => {
    let live = true, changed = false
    const accept = (value: GameSnapshot) => { if (live) setSnapshot(value.sessionId === sessionId && value.status === 'running' && (value.source === 'hook' || value.source === 'clipboard') ? value : undefined) }
    const unsubscribe = api.onChanged(value => { changed = true; accept(value) })
    void api.snapshot().then(value => { if (!changed) accept(value) }).catch(() => { if (live) setSnapshot(undefined) })
    return () => { live = false; unsubscribe() }
  }, [api, sessionId])
  const line = snapshot?.lines.at(-1)
  if (!line) return null
  const source = (config.showSource || line.status === 'error') ? line.text : ''
  const target = config.showTranslation && line.status === 'ready' ? line.translation : undefined
  if (!source && !target) return null
  const style = {
    '--overlay-background-color': config.backgroundColor,
    '--overlay-background-alpha': `${Math.round(config.backgroundOpacity * 100)}%`,
    '--overlay-source-color': config.sourceColor,
    '--overlay-translation-color': config.translationColor,
    '--overlay-font-size': `${config.fontSize}px`, '--overlay-font-weight': config.fontWeight, '--overlay-line-height': config.lineHeight,
    '--overlay-translation-font-size': `${config.translationFontSize}px`, '--overlay-translation-font-weight': config.translationFontWeight, '--overlay-translation-line-height': config.translationLineHeight,
  } as CSSProperties
  return <main className="game-overlay" data-slot="game-overlay" aria-label={t('suite.gameTitle')} style={style}><div className="game-overlay__caption">
    {source && <CaptionTrack key={`source:${line.id}`} kind="source" lines={[{ key: line.id, text: source }]} maxLines={3} layout="sentence" />}
    {target && <CaptionTrack key={`translation:${line.id}`} kind="translation" lines={[{ key: line.id, text: target }]} maxLines={3} layout="sentence" />}
  </div></main>
}
