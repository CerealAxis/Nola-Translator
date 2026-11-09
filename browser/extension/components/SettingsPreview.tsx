import { useState } from 'react'
import { ArrowLeft, Copy, Languages, MoreHorizontal, MoreVertical, Play, Settings2, Volume2, X } from 'lucide-react'
import { Button } from '../../../src/renderer/components/ui/button'
import { NolaLogo } from '../logo'
import { browserText } from '../i18n'
import type { Preferences } from '../preferences'

export type PreviewKind = 'web' | 'video' | 'floatingButton' | 'selection' | 'inputTranslation' | 'contextMenu'
export function SettingsPreview({ kind, settings, t }: { kind: PreviewKind; settings: Preferences; t: ReturnType<typeof browserText> }) {
  const [translated, setTranslated] = useState(false)
  const [open, setOpen] = useState(false)
  const target = kind === 'video' ? settings.videoLanguage : settings.pageLanguage
  const example = browserText(target === 'zh' ? 'zh-CN' : target === 'en' || target === 'ja' || target === 'ko' ? target : settings.uiLanguage)('exampleText')
  const source = browserText(target === 'en' ? 'zh-CN' : 'en')('exampleText')
  const translationLabel = t(translated ? 'restorePage' : 'translateText')
  return <figure className="nola-feature-preview nola-illustration" data-preview={kind} aria-label={t('livePreview')}>
    <div className="nola-preview-stage">
      <div className="nola-demo-browser">
        <div className="nola-demo-chrome" aria-hidden="true"><div className="nola-demo-dots"><i /><i /><i /></div><ArrowLeft /><span /><MoreHorizontal /></div>
        <div className="nola-demo-page">
          {kind === 'video' ? <div className="nola-demo-video">
            <div className="nola-demo-landscape" aria-hidden="true"><i /><i /><i /></div>
            <div className="nola-demo-captions" style={{ left: `${settings.subtitlePositionX}%`, bottom: `${settings.subtitleFollow ? settings.subtitleOffset + 12 : 100 - settings.subtitlePositionY}%`, fontWeight: settings.subtitleBold ? 700 : 400 }}>
              {settings.videoDisplay !== 'translation' && <span style={{ order: settings.subtitleTranslationFirst ? 1 : 0, fontFamily: settings.subtitleSourceFont, fontSize: settings.subtitleSourceSize, color: settings.subtitleSourceColor, background: `color-mix(in srgb, ${settings.subtitleBackground} ${settings.subtitleBackgroundOpacity * 100}%, transparent)` }}>{source}</span>}
              {settings.videoDisplay !== 'source' && <span style={{ fontFamily: settings.subtitleTranslationFont, fontSize: settings.subtitleTranslationSize, color: settings.subtitleTranslationColor, background: `color-mix(in srgb, ${settings.subtitleBackground} ${settings.subtitleBackgroundOpacity * 100}%, transparent)` }}>{example}</span>}
            </div>
            <div className="nola-demo-player" aria-hidden="true"><Play /><span /><Volume2 /></div>
          </div> : <>
            <div className="nola-illustration-article">
              <div className="nola-illustration-heading" aria-hidden="true" />
              {kind === 'inputTranslation' ? <div className="nola-illustration-input" data-translated={translated}>
                <div className="nola-illustration-lines" aria-hidden="true"><i /><i /></div>
                {settings.inputTranslation && <Button size="icon-sm" variant="outline" aria-label={translationLabel} title={translationLabel} onClick={() => setTranslated(!translated)}><Languages /></Button>}
              </div> : <>
                {(kind !== 'web' || settings.pageDisplay === 'bilingual') && <div className="nola-illustration-lines" role="img" aria-label={t('sourceCaption')} data-selected={kind === 'selection' && settings.selectionTranslation}><i /><i /><i /></div>}
                {(kind === 'web' || translated) && <div className="nola-illustration-lines nola-illustration-translation" role="img" aria-label={t('translatedCaption')} data-style={settings.pageStyle}><i /><i /></div>}
                <div className="nola-illustration-lines nola-illustration-continuation" aria-hidden="true"><i /><i /><i /></div>
              </>}
            </div>
            {kind === 'selection' && settings.selectionTranslation && <div className="nola-illustration-toolbar nola-glass-popup" style={{ opacity: settings.selectionOpacity }} onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}>
              {settings.selectionTranslate && <Button size="icon-sm" variant="bare" aria-label={translationLabel} title={translationLabel} onClick={() => setTranslated(!translated)}><Languages /></Button>}
              {settings.selectionSpeak && <Volume2 role="img" aria-label={t('tts')} />}
              <Button size="icon-sm" variant="bare" aria-label={t('more')} title={t('more')} aria-expanded={open} onClick={() => setOpen(!open)}><MoreVertical /></Button>
              {open && <div className="nola-illustration-more nola-glass-popup" role="group" aria-label={t('more')}>
                {settings.selectionCopy && <Copy role="img" aria-label={t('copyTranslation')} />}
                <Button size="icon-sm" variant="bare" aria-label={t('close')} title={t('close')} onClick={() => setOpen(false)}><X /></Button>
              </div>}
            </div>}
            {kind === 'floatingButton' && settings.floatingButton && <div className="nola-demo-floating" data-pinned={settings.floatingLocked} data-side={settings.floatingSide} style={{ top: `${Math.max(20, Math.min(75, settings.floatingPosition * 100))}%` }}>
              <Button className="nola-demo-floating-action" variant={translated ? "default" : "outline"} size="sm" aria-label={t(translated ? 'restorePage' : 'translatePage')} onClick={() => setTranslated(!translated)}><Languages /></Button>
              <Button className="nola-demo-dock" variant="outline" size="lg" aria-label={t('floatingButton')} onClick={() => settings.floatingClickAction === 'translate' ? setTranslated(!translated) : setOpen(!open)}><NolaLogo /></Button>
            </div>}
            {kind === 'floatingButton' && settings.floatingButton && open && settings.floatingClickAction === 'panel' && <div className="nola-illustration-sidebar nola-glass-popup">
              <header><NolaLogo /><Button size="icon-sm" variant="bare" aria-label={t('close')} onClick={() => setOpen(false)}><X /></Button></header>
              <div className="nola-illustration-lines" aria-hidden="true"><i /><i /></div>
              <Button size="icon-sm" aria-label={translationLabel} onClick={() => setTranslated(!translated)}><Languages /></Button>
              <Settings2 aria-hidden="true" />
            </div>}
            {kind === 'contextMenu' && settings.contextMenuEnabled && <div className="nola-illustration-context nola-glass-popup">
              {settings.contextMenuPage && <span role="img" aria-label={t('togglePageTranslation')}><Languages /><i /></span>}
              {settings.contextMenuSelection && <span role="img" aria-label={t('translateSelection')}><Languages /><i /></span>}
              {settings.contextMenuSpeak && <span role="img" aria-label={t('speakSelection')}><Volume2 /><i /></span>}
              {settings.contextMenuInput && <span role="img" aria-label={t('inputTranslation')}><Languages /><i /></span>}
            </div>}
          </>}
        </div>
      </div>
    </div>
  </figure>
}
