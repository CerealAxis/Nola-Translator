import { app, Menu, nativeImage, Tray, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { AppSettings } from '../shared/settings'
import type { FeatureActivitySnapshot } from '../shared/feature-activity'
import { resolveUiLanguage } from '../shared/languages'
import { gatewayEn, gatewayJa, gatewayKo, gatewayHk, gatewayTw, gatewayZh } from '../renderer/i18n/gateway-ui'
import { meetingLocales } from '../renderer/i18n/meeting-ui'
import { screenLocales } from '../renderer/i18n/screen-ui'
import { suiteLocales } from '../renderer/i18n/translation-suite-ui'

export interface NolaTrayOptions {
  getSettings(): AppSettings
  getActivity(): FeatureActivitySnapshot
  show(): void
  stop(): Promise<void>
  quit(): void
  screenTranslation?: {
    status(): string
    open(): void
    pause(): Promise<void>
    resume(): Promise<void>
    stop(): Promise<void>
  }
}

export class NolaTray {
  private tray: Tray | null = null
  constructor(private readonly options: NolaTrayOptions) {}
  private dictionary() {
    const language = resolveUiLanguage(this.options.getSettings().uiLanguage, app.getLocale())
    const gateway = ({ 'zh-CN': gatewayZh, 'zh-TW': gatewayTw, 'zh-HK': gatewayHk, en: gatewayEn, ja: gatewayJa, ko: gatewayKo })[language]
    return { ...gateway, meeting: meetingLocales[language].title, 'screen-translation': screenLocales[language].title,
      'game-translation': suiteLocales[language].gameTitle, 'comic-translation': suiteLocales[language].comicTitle, screen: screenLocales[language] }
  }
  async initialize(): Promise<void> {
    // Use a bundled image instead of relying on Windows shell extraction or its icon cache.
    const iconPath = app.isPackaged ? join(process.resourcesPath, 'tray.png') : join(app.getAppPath(), 'build/tray.png')
    const icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) throw new Error(`Tray icon could not be loaded: ${iconPath}`)
    this.tray = new Tray(icon.resize({ width: 32, height: 32 }))
    this.tray.setToolTip('Nola Translator')
    this.tray.on('double-click', () => this.options.show())
    this.refresh()
  }
  refresh(): void {
    const t = this.dictionary()
    const activity = this.options.getActivity()
    this.tray?.setContextMenu(Menu.buildFromTemplate([
      { label: t.trayOpen, click: () => this.options.show() },
      ...(this.options.screenTranslation ? [
        { label: t.screen.title, click: () => this.options.screenTranslation!.open() },
        ...(['running', 'waiting', 'paused'].includes(this.options.screenTranslation.status()) ? [
          { label: this.options.screenTranslation.status() === 'paused' ? t.screen.resume : t.screen.pause,
            click: () => { const control = this.options.screenTranslation!; void (control.status() === 'paused' ? control.resume() : control.pause()).catch(error => console.error('screen translation control failed', error)) } },
          { label: t.screen.stop, click: () => { void this.options.screenTranslation!.stop().catch(error => console.error('screen translation stop failed', error)) } },
        ] : []),
      ] : []),
      { type: 'separator' },
      ...((activity.activities?.length ? activity.activities : activity.owner ? [{ owner: activity.owner, phase: activity.phase }] : []).map(item => ({ label: `${t[item.owner === 'comic-editor' ? 'comic-translation' : item.owner]} · ${t[item.phase === 'idle' ? 'stopped' : item.phase]}`, enabled: false }))),
      ...(!activity.owner ? [{ label: t.trayIdle, enabled: false }] : []),
      { label: t.trayStop, enabled: !!activity.owner && activity.phase !== 'stopping', click: () => { void this.options.stop().catch(error => console.error('tray stop failed', error)) } },
      { type: 'separator' },
      { label: t.trayExit, click: () => this.options.quit() },
    ]))
  }
  activityChanged(): void { this.refresh() }
  dispose(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
