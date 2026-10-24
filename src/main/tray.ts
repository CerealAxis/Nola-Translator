import { app, Menu, nativeImage, Notification, Tray, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { AppSettings } from '../shared/settings'
import type { FeatureActivitySnapshot } from '../shared/feature-activity'
import { resolveUiLanguage } from '../shared/languages'
import { gatewayEn, gatewayJa, gatewayKo, gatewayHk, gatewayTw, gatewayZh } from '../renderer/i18n/gateway-ui'

export interface NolaTrayOptions {
  getSettings(): AppSettings
  getWindow(): BrowserWindow | null
  getActivity(): FeatureActivitySnapshot
  show(): void
  stop(): Promise<void>
  quit(): void
}

export class NolaTray {
  private tray: Tray | null = null
  private hiddenOnce = false
  private readonly notifications = new Set<Notification>()
  constructor(private readonly options: NolaTrayOptions) {}
  private dictionary() {
    const language = resolveUiLanguage(this.options.getSettings().uiLanguage, app.getLocale())
    return ({ 'zh-CN': gatewayZh, 'zh-TW': gatewayTw, 'zh-HK': gatewayHk, en: gatewayEn, ja: gatewayJa, ko: gatewayKo })[language]
  }
  async initialize(): Promise<void> {
    const icon = app.isPackaged ? await app.getFileIcon(process.execPath, { size: 'small' }) : nativeImage.createFromPath(join(app.getAppPath(), 'build/icon.ico'))
    this.tray = new Tray(icon)
    this.tray.setToolTip('Nola Translator')
    this.tray.on('double-click', () => this.options.show())
    this.refresh()
  }
  refresh(): void {
    const t = this.dictionary()
    const activity = this.options.getActivity()
    this.tray?.setContextMenu(Menu.buildFromTemplate([
      { label: t.trayOpen, click: () => this.options.show() },
      { type: 'separator' },
      { label: activity.owner ? `${t[activity.owner]} · ${t[activity.phase === 'idle' ? 'stopped' : activity.phase]}` : t.trayIdle, enabled: false },
      { label: t.trayStop, enabled: !!activity.owner && activity.phase !== 'stopping', click: () => { void this.options.stop().catch(error => console.error('tray stop failed', error)) } },
      { type: 'separator' },
      { label: t.trayExit, click: () => this.options.quit() },
    ]))
  }
  hidden(): void {
    if (this.hiddenOnce) return
    this.hiddenOnce = true
    const t = this.dictionary()
    this.notify(t.trayHiddenTitle, t.trayHiddenBody)
  }
  activityChanged(snapshot: FeatureActivitySnapshot): void {
    this.refresh()
    const t = this.dictionary()
    if (snapshot.phase === 'running' || snapshot.phase === 'idle') this.notify(t.trayStateTitle, snapshot.owner ? `${t[snapshot.owner]} · ${t.running}` : t.trayStoppedBody)
  }
  failure(): void { const t = this.dictionary(); this.notify(t.trayStateTitle, t.failed) }
  private notify(title: string, body: string): void {
    const window = this.options.getWindow()
    if (window && !window.isDestroyed() && window.isVisible() && !window.isMinimized()) return
    if (!Notification.isSupported()) return
    const notification = new Notification({ title, body })
    this.notifications.add(notification)
    notification.on('click', () => this.options.show())
    notification.on('close', () => this.notifications.delete(notification))
    notification.show()
  }
  dispose(): void {
    for (const notification of this.notifications) notification.close()
    this.notifications.clear()
    this.tray?.destroy()
    this.tray = null
  }
}
