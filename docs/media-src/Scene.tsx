import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { Button } from '@heroui/react'
import { ArrowLeft, ArrowRight, RotateCw, LockKeyhole, Play, Pause, Volume2, Maximize, Captions } from 'lucide-react'
import { OverlayRoot } from '@/features/overlay'
import { useI18n } from '@/i18n'
import { stores } from '@/store'
import { captionLines } from '../../browser/extension/captionPresentation'
import extensionStyles from '../../browser/extension/styles.css?inline'

export interface SceneProps { browser?: boolean }

/** Original scenery surrounds the real overlay component or the extension's exact caption styles. */
export function Scene({ browser = false }: SceneProps) {
  const { t } = useI18n()
  const [playing, setPlaying] = useState(true)
  return <div className={['docs-scene', browser && 'docs-scene--browser'].filter(Boolean).join(' ')}>
    {browser ? <div className="docs-browser-chrome">
      <div className="docs-browser-tab"><span className="docs-browser-tab-dot" />{t('videoCaptions.title')}<span>×</span></div>
      <div className="docs-browser-address"><ArrowLeft aria-hidden="true" /><ArrowRight aria-hidden="true" /><RotateCw aria-hidden="true" /><div><LockKeyhole aria-hidden="true" />nola.example / watch / a-world-to-understand</div></div>
    </div> : null}
    <div className="docs-scene-landscape" aria-hidden="true">
      <span className="docs-scene-sun" /><span className="docs-scene-mountain docs-scene-mountain--back" /><span className="docs-scene-mountain docs-scene-mountain--front" />
      <div className="docs-scene-type"><span>A WORLD TO</span><strong>understand.</strong><span>Every voice. Every perspective.</span></div>
      <span className="docs-scene-orbit" /><span className="docs-scene-orbit docs-scene-orbit--second" />
    </div>
    {browser ? <>
      <BrowserCaption />
      <div className="docs-player-controls"><Button isIconOnly variant="secondary" aria-label={playing ? t('workspace.pause') : t('workspace.resume')} onPress={() => setPlaying(!playing)}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</Button><Volume2 aria-hidden="true" /><span>02:48 / 18:36</span><div className="docs-player-progress"><i /></div><Captions aria-hidden="true" /><Maximize aria-hidden="true" /></div>
    </> : <div className="docs-scene-overlay"><OverlayRoot /></div>}
  </div>
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
