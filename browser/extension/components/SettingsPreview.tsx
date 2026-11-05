import { useState } from 'react'
import { ArrowLeft, Copy, Languages, MoreHorizontal, Play, Settings2, Volume2, X } from 'lucide-react'
import { Button } from '../../../src/renderer/components/ui/button'
import { NolaLogo } from '../logo'
import { browserText } from '../i18n'
import type { Preferences } from '../preferences'

export type PreviewKind = 'web' | 'video' | 'floatingButton' | 'selection' | 'inputTranslation' | 'contextMenu'
export function SettingsPreview({ kind, settings, t }: { kind: PreviewKind; settings: Preferences; t: ReturnType<typeof browserText> }) {
  const [translated, setTranslated] = useState(false)
  const [open, setOpen] = useState(false)
  const target = kind === 'video' ? settings.videoLanguage : kind === 'inputTranslation' ? settings.inputTargetLanguage : settings.pageLanguage
  const example = browserText(target === 'zh' ? 'zh-CN' : target === 'en' || target === 'ja' || target === 'ko' ? target : settings.uiLanguage)('exampleText')
  const source = browserText(target === 'en' ? 'zh-CN' : 'en')('exampleText')
  return <figure className="nola-feature-preview" data-preview={kind}>
    <div className="nola-preview-stage">
      <div className="nola-demo-browser">
        <div className="nola-demo-chrome" aria-hidden="true"><div className="nola-demo-dots"><i /><i /><i /></div><ArrowLeft /><span>example.com</span><MoreHorizontal /></div>
        <div className="nola-demo-page">
          {kind === 'video' ? <div className="nola-demo-video">
            <div className="nola-demo-landscape" aria-hidden="true"><i /><i /><i /></div>
            <div className="nola-demo-captions" style={{ left: `${settings.subtitlePositionX}%`, bottom: `${settings.subtitleFollow ? settings.subtitleOffset + 12 : 100 - settings.subtitlePositionY}%`, fontWeight: settings.subtitleBold ? 700 : 400 }}>
              {settings.videoDisplay !== 'translation' && <span style={{ order: settings.subtitleTranslationFirst ? 1 : 0, fontFamily: settings.subtitleSourceFont, fontSize: settings.subtitleSourceSize, color: settings.subtitleSourceColor, background: `color-mix(in srgb, ${settings.subtitleBackground} ${settings.subtitleBackgroundOpacity * 100}%, transparent)` }}>{source}</span>}
              {settings.videoDisplay !== 'source' && <span style={{ fontFamily: settings.subtitleTranslationFont, fontSize: settings.subtitleTranslationSize, color: settings.subtitleTranslationColor, background: `color-mix(in srgb, ${settings.subtitleBackground} ${settings.subtitleBackgroundOpacity * 100}%, transparent)` }}>{example}</span>}
            </div>
            <div className="nola-demo-player" aria-hidden="true"><Play /><span /><Volume2 /></div>
          </div> : <>
            <div className="nola-demo-article"><div className="nola-demo-eyebrow">NOLA JOURNAL</div><h3>{t('exampleHeading')}</h3>
              {kind === 'inputTranslation' ? <div className="nola-demo-input"><p>{translated ? example : source}</p><Button size="sm" variant="outline" onClick={() => setTranslated(!translated)}><Languages data-icon="inline-start" />{t(translated ? 'restorePage' : 'translateText')}</Button></div> : <>
                {(kind !== 'web' || settings.pageDisplay === 'bilingual') && <p className={kind === 'selection' ? 'nola-demo-selected' : undefined}>{source}</p>}
                {(kind === 'web' || translated) && <p className="nola-demo-translation" data-style={settings.pageStyle}>{example}</p>}
                <div className="nola-demo-lines" aria-hidden="true"><i /><i /><i /></div>
              </>}
            </div>
            {kind === 'selection' && settings.selectionTranslation && <div className="nola-demo-toolbar" style={{ opacity: settings.selectionOpacity }}>
              {settings.selectionTranslate && <Button size="sm" variant="outline" onClick={() => setTranslated(!translated)}><Languages data-icon="inline-start" />{t('translateText')}</Button>}
              {settings.selectionSpeak && <Volume2 aria-label={t('tts')} />}{settings.selectionCopy && <Copy aria-label={t('copyTranslation')} />}
            </div>}
            {kind === 'floatingButton' && settings.floatingButton && <div className="nola-demo-floating" data-pinned={settings.floatingLocked} data-side={settings.floatingSide} style={{ top: `${Math.max(20, Math.min(75, settings.floatingPosition * 100))}%` }}>
              <Button className="nola-demo-floating-action" variant="outline" size="icon-sm" aria-label={t(translated ? 'restorePage' : 'translatePage')} onClick={() => setTranslated(!translated)}><Languages /></Button>
              <Button className="nola-demo-dock" variant="outline" size="icon" aria-label={t('floatingButton')} onClick={() => settings.floatingClickAction === 'translate' ? setTranslated(!translated) : setOpen(!open)}><NolaLogo /></Button>
            </div>}
            {kind === 'floatingButton' && settings.floatingButton && open && settings.floatingClickAction === 'panel' && <div className="nola-demo-sidebar">
              <header><strong>Nola Translator</strong><Button size="icon-sm" variant="bare" aria-label={t('close')} onClick={() => setOpen(false)}><X /></Button></header>
              <span>{t('openTranslationPanel')}</span>
              <Button size="sm" onClick={() => setTranslated(!translated)}><Languages data-icon="inline-start" />{t(translated ? 'restorePage' : 'translatePage')}</Button>
              <span><Settings2 />{t('settings')}</span>
            </div>}
            {kind === 'contextMenu' && settings.contextMenuEnabled && <div className="nola-demo-context">
              {settings.contextMenuPage && <span><Languages />{t('togglePageTranslation')}</span>}
              {settings.contextMenuSelection && <span><Languages />{t('translateSelection')}</span>}
              {settings.contextMenuSpeak && <span><Volume2 />{t('speakSelection')}</span>}
              {settings.contextMenuInput && <span><Languages />{t('inputTranslation')}</span>}
            </div>}
          </>}
        </div>
      </div>
    </div>
    <figcaption><span>{t('livePreview')}</span><span>{t('previewHint')}</span></figcaption>
  </figure>
}
