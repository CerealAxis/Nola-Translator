import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, ToggleButton, ToggleButtonGroup, toast } from '@heroui/react'
import { ArrowRight, ChevronDown, ExternalLink, Info, Lock, Mic, Minus, Monitor, MoreHorizontal, Pin, Settings, Square, X } from 'lucide-react'
import { DEFAULT_SETTINGS, LANGUAGE_LABELS } from '@/bridge'
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
  const sourceText = latest?.sourceText || t('shellUi.previewSource')
  const translationText = latest?.translations.find(item => item.state === 'complete')?.text || t('shellUi.previewTarget')
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
  /*
   * 预览卡的 CSS 自定义属性。**变量名沿用主仓的 `--preview-*`**，没有跟浮窗本体的
   * `--overlay-*` 合并：两边是两个组件，各改各的，合并之后改预览会顺带改到真窗。
   * 数值全部原样传下去，不在这里做任何 clamp —— 主仓也没有 clamp。
   */
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
  /** 底部第一个胶囊显示的是**翻译服务商**，跟主仓的 `translationProviderLabel` 同一口径。 */
  const providerNames = { hymt2: 'Hy-MT2', m2m100: 'M2M100', microsoft: 'Microsoft Translator', openai: 'OpenAI', ollama: 'Ollama' } as const
  return (
    <div className="nola-overlay-page">
      <PageHeader className="nola-page-intro" title={t('shellUi.overlay')} subtitle={t('shellUi.overlaySubtitle')}
        actions={<Button onPress={() => void open()} isPending={opening}><ExternalLink aria-hidden="true" />{t('shellUi.openOverlay')}</Button>} />
      <Card className="nola-overlay-preview">
        <Card.Header className="flex-row items-center justify-between gap-3">
          <Card.Title className="text-lg font-semibold">{t('shellUi.captionPreview')}</Card.Title>
          <Card.Description>{t('shellUi.movable')}</Card.Description>
        </Card.Header>
        {/*
         * 预览卡的结构逐条照主仓 `src/renderer/components/CaptionPreview.tsx`：
         * 文字区 → 上下两条渐隐罩 → 右上角七个动作（含那根 1px 分隔线）→ 底部麦克风加
         * 三个胶囊。整块 `aria-hidden`，它只是外观预览，真控件都在这一页下面那张表单里。
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
              <span className="nola-caption-preview__mic">{sessionActive ? <Square /> : <Mic />}</span>
              <span className="nola-caption-preview__pill">{providerNames[settings.translation.provider]}<ChevronDown /></span>
              <span className="nola-caption-preview__pill">{label(settings.recognition.sourceLanguage)} → {label(settings.translation.targetLanguage)}</span>
              <span className="nola-caption-preview__pill">{t(display === 'both' ? 'workspace.modeBoth' : display === 'source' ? 'workspace.modeSource' : 'workspace.modeTranslation')}</span>
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
          <p className="flex items-center gap-2 text-xs text-muted"><Info className="size-4 shrink-0" aria-hidden="true" />{t('shellUi.overlayHint')}</p>
        </Card.Footer>
      </Card>
    </div>
  )
}
