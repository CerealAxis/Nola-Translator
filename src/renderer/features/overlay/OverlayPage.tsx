import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, ToggleButton, ToggleButtonGroup, toast } from '@heroui/react'
import { ArrowRight, ChevronDown, ExternalLink, Lock, Mic, Minus, Monitor, MoreHorizontal, Pin, Settings, Square, X } from 'lucide-react'
import { DEFAULT_SETTINGS, LANGUAGE_LABELS, RECOGNITION_MODEL_LABELS } from '@/bridge'
import type { AppSettingsPatch } from '@/bridge'
import { useI18n } from '@/i18n'
import { useRoute } from '@/routes'
import { getBridge, sessionStore, stores, updateSettings, useStore } from '@/store'
import { PageHeader } from '@/components/primitives'
import { SettingSelect } from '../settings/SettingsPage'

export function OverlayPage() {
  const { t, language } = useI18n()
  const { navigate } = useRoute()
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const devices = useStore(stores.models, state => state.devices)
  const session = useStore(sessionStore, state => state)
  const sessionActive = !['idle', 'error'].includes(session.status)
  const [opening, setOpening] = useState(false)
  const config = settings.overlay
  const latest = session.interim ?? session.segments.at(-1)
  const sourceText = latest?.sourceText || t('overlay.notStarted')
  const translationText = latest?.translations.find(item => item.state === 'complete')?.text || t('overlay.notStartedHint')
  const display = config.showSource && config.showTranslation ? 'both' : config.showSource ? 'source' : 'translation'
  const label = (code: string) => {
    const entry = LANGUAGE_LABELS[code]
    return entry ? language === 'zh-CN' ? entry.zh : entry.en : code
  }
  const patch = (value: AppSettingsPatch) => { void updateSettings(value).catch(() => toast.danger(t('errors.storageChangedAction'))) }
  const open = async () => {
    setOpening(true)
    try { await getBridge()?.overlay.show() } catch { toast.danger(t('shellUi.errorOpening')) }
    finally { setOpening(false) }
  }
  const languages = ['auto:zh', 'en:zh', 'zh:en', 'ja:zh', 'ko:zh'].map(pair => {
    const [source, target] = pair.split(':')
    return { value: pair, label: `${label(source)} → ${label(target)}` }
  })
  const currentPair = `${settings.recognition.sourceLanguage}:${settings.translation.targetLanguage}`
  if (!languages.some(item => item.value === currentPair)) languages.push({ value: currentPair, label: `${label(settings.recognition.sourceLanguage)} → ${label(settings.translation.targetLanguage)}` })
  const previewStyle = {
    '--preview-background-color': config.backgroundColor,
    '--preview-background-alpha': `${Math.round(config.backgroundOpacity * 100)}%`,
    '--preview-source-color': config.sourceColor,
    '--preview-translation-color': config.translationColor,
    '--preview-font-size': `${config.fontSize}px`,
    '--preview-font-weight': config.fontWeight,
    '--preview-line-height': config.lineHeight,
    '--preview-translation-font-size': `${config.translationFontSize}px`,
    '--preview-translation-font-weight': config.translationFontWeight,
    '--preview-translation-line-height': config.translationLineHeight,
    fontFamily: config.fontFamily,
  } as CSSProperties
  return (
    <div className="nola-overlay-page">
      <PageHeader className="nola-page-intro" title={t('shellUi.overlay')}
        actions={<Button onPress={() => void open()} isPending={opening}><ExternalLink aria-hidden="true" />{t('shellUi.openOverlay')}</Button>} />
      <Card className="nola-overlay-preview">
        <Card.Header>
          <Card.Title className="text-lg font-semibold">{t('shellUi.captionPreview')}</Card.Title>
        </Card.Header>
        {/*
         * Text area, top and bottom scrims, the seven action glyphs, then the mic
         * and pills below. Entirely `aria-hidden`: this is an appearance preview, and
         * the real controls are in the form underneath.
         */}
        <Card.Content className="nola-overlay-stage">
          <div
            className="nola-caption-preview"
            data-color-scheme={config.colorScheme}
            data-transparent-background={config.backgroundOpacity <= 0}
            style={previewStyle}
            aria-hidden="true"
          >
            <div className="nola-caption-preview__text">
              {config.showSource ? <p className="nola-caption-preview__source">{sourceText}</p> : null}
              {config.showTranslation ? <p className="nola-caption-preview__translation">{translationText}</p> : null}
            </div>
            <div className="nola-caption-preview__scrim" data-edge="top" />
            <div className="nola-caption-preview__scrim" data-edge="bottom" />
            <div className="nola-caption-preview__actions">
              <Monitor /><Lock /><Pin /><i /><MoreHorizontal /><Minus /><X />
            </div>
            <div className="nola-caption-preview__controls">
              {/*
               * Mirrors the control bar's six items in order: mic, recognition
               * model, source language, target language, display, layout. Only the
               * last two carry a chevron, because only those two open menus in
               * the real window.
               */}
              <span className="nola-caption-preview__mic">{sessionActive ? <Square /> : <Mic />}</span>
              <span className="nola-caption-preview__pill">{RECOGNITION_MODEL_LABELS[settings.recognition.modelId]}</span>
              <span className="nola-caption-preview__pill">{label(settings.recognition.sourceLanguage)}</span>
              <span className="nola-caption-preview__pill">{label(settings.translation.targetLanguage)}</span>
              <span className="nola-caption-preview__pill">{t(display === 'both' ? 'workspace.modeBoth' : display === 'source' ? 'workspace.modeSource' : 'workspace.modeTranslation')}<ChevronDown /></span>
              <span className="nola-caption-preview__pill">{t(config.layout === 'rolling' ? 'workspace.layoutSplit' : 'workspace.layoutSentence')}<ChevronDown /></span>
            </div>
          </div>
        </Card.Content>
      </Card>
      <Card className="nola-section-card p-5">
        <Card.Header className="mb-5"><Card.Title>{t('shellUi.overlaySettings')}</Card.Title></Card.Header>
        <Card.Content className="nola-overlay-fields">
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.audioSource')}</span>
            <SettingSelect value={settings.recognition.audioSource} ariaLabel={t('shellUi.audioSource')} isDisabled={sessionActive}
              options={[{ value: 'defaultOutput', label: t('shellUi.audioSystem') }, ...devices.map(device => ({ value: device.deviceId, label: device.name }))]}
              onChange={audioSource => patch({ recognition: { audioSource } })} />
          </div>
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.languageDirection')}</span>
            <SettingSelect value={currentPair} ariaLabel={t('shellUi.languageDirection')} isDisabled={sessionActive} options={languages} onChange={value => {
              const [sourceLanguage, targetLanguage] = value.split(':')
              patch({ recognition: { sourceLanguage }, translation: { targetLanguage } })
            }} />
          </div>
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.showContent')}</span>
            <ToggleButtonGroup className="nola-segmented" selectionMode="single" selectedKeys={new Set([display])} aria-label={t('shellUi.showContent')} onSelectionChange={keys => {
              const next = [...keys][0]; if (next) patch({ overlay: { showSource: next !== 'translation', showTranslation: next !== 'source' } })
            }}>
              <ToggleButton id="both">{t('workspace.modeBoth')}</ToggleButton>
              <ToggleButton id="source">{t('workspace.modeSource')}</ToggleButton>
              <ToggleButton id="translation">{t('workspace.modeTranslation')}</ToggleButton>
            </ToggleButtonGroup>
          </div>
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.layout')}</span>
            <ToggleButtonGroup className="nola-segmented" selectionMode="single" selectedKeys={new Set([config.layout])} aria-label={t('shellUi.layout')} onSelectionChange={keys => {
              const next = [...keys][0]; if (next === 'rolling' || next === 'sentence') patch({ overlay: { layout: next } })
            }}>
              <ToggleButton id="rolling">{t('workspace.layoutSplit')}</ToggleButton>
              <ToggleButton id="sentence">{t('workspace.layoutSentence')}</ToggleButton>
            </ToggleButtonGroup>
          </div>
        </Card.Content>
        <Card.Footer className="nola-overlay-footer">
          <Button variant="ghost" onPress={() => navigate('#/settings/appearance')}><Settings aria-hidden="true" />{t('shellUi.appearance')}<ArrowRight aria-hidden="true" /></Button>
        </Card.Footer>
      </Card>
    </div>
  )
}
