import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight, RotateCw, LockKeyhole, Play, Pause, Volume2, Maximize, Captions } from 'lucide-react'
import { OverlayRoot } from '@/features/overlay'
import { useNolaTheme } from '@/components/primitives'
import { useI18n } from '@/i18n'
import { stores } from '@/store'
import { captionLines } from '../../browser/extension/captionPresentation'
import extensionStyles from '../../browser/extension/styles.css?inline'
import videoFrame from './scene-video-frame.jpg'

export interface SceneProps { browser?: boolean }

/* The shared `.button svg` rule also reaches these player controls, so their
   larger glyph size must remain explicit. */
const controlIconStyle = { width: 20, height: 20 }

/** A licensed film frame places the real caption surfaces in a familiar viewing scene. */
export function Scene({ browser = false }: SceneProps) {
  useNolaTheme()
  const { t } = useI18n()
  const [playing, setPlaying] = useState(true)
  return <div className={['docs-scene', browser && 'docs-scene--browser'].filter(Boolean).join(' ')}>
    {browser ? <div className="docs-browser-chrome">
      <div className="docs-browser-tab"><span className="docs-browser-tab-dot" />Tears of Steel · {t('videoCaptions.title')}<span>×</span></div>
      <div className="docs-browser-address"><ArrowLeft aria-hidden="true" /><ArrowRight aria-hidden="true" /><RotateCw aria-hidden="true" /><div><LockKeyhole aria-hidden="true" />video.example / watch / tears-of-steel</div></div>
    </div> : null}
    <div className="docs-scene-video" aria-hidden="true"><img src={videoFrame} alt="" /></div>
    {browser ? <>
      <BrowserCaption />
      <PlayerControls playing={playing} setPlaying={setPlaying} />
    </> : <>
      <div className="docs-scene-overlay"><OverlayRoot /></div>
      <PlayerControls playing={playing} setPlaying={setPlaying} />
    </>}
  </div>
}

function PlayerControls({ playing, setPlaying }: { playing: boolean; setPlaying: (playing: boolean) => void }) {
  const { t } = useI18n()
  return <div className="docs-player-controls"><Button variant="tertiary" size="icon" aria-label={playing ? t('workspace.pause') : t('workspace.resume')} onClick={() => setPlaying(!playing)}>{playing ? <Pause aria-hidden="true" style={controlIconStyle} /> : <Play aria-hidden="true" style={controlIconStyle} />}</Button><Volume2 aria-hidden="true" /><span>00:23 / 12:14</span><div className="docs-player-progress"><i /></div><Captions aria-hidden="true" /><Maximize aria-hidden="true" /></div>
}

function BrowserCaption() {
  const host = useRef<HTMLDivElement>(null)
  const root = useRef<Root | null>(null)
  useEffect(() => {
    if (!host.current) return
    const shadow = host.current.shadowRoot ?? host.current.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = extensionStyles
    const mount = document.createElement('div')
    mount.className = 'nola-extension'
    shadow.replaceChildren(style, mount)
    root.current = createRoot(mount)
    const settings = stores.settings.getState().settings!
    const config = { ...settings.browserCaptions, audioSource: 'tab' as const, sourceLanguage: settings.recognition.sourceLanguage, targetLanguage: settings.translation.targetLanguage }
    const segment = stores.session.getState().segments[0]
    const lines = captionLines(segment ? { ...segment, videoStartedAtMs: 0 } : undefined, config)
    // The extension paints this same structure and per-track typography in content.tsx.
    root.current.render(<div className="nola-caption" style={{ lineHeight: config.lineHeight, backgroundColor: `color-mix(in oklab, ${config.backgroundColor} ${config.backgroundOpacity * 100}%, transparent)` }}>
      {lines.map((line, index) => <div key={index} style={{ fontSize: index === 0 ? config.sourceFontSize : config.translationFontSize, color: index === 0 ? config.sourceColor : config.translationColor }}>{line}</div>)}
    </div>)
    return () => { root.current?.unmount(); root.current = null }
  }, [])
  return <div className="docs-browser-caption" ref={host} />
}
