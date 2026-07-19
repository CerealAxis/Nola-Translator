import { useEffect, useState } from 'react'

import { DEFAULT_SETTINGS, type AppSettings, type OverlaySettings } from '../../shared/settings'
import { CaptionPreview } from '../components/CaptionPreview'

export function AppearancePage(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [notice, setNotice] = useState('正在读取设置…')
  const api = window.fluentCaptions

  useEffect(() => {
    if (!api) return
    let active = true
    void api.getSettings().then((value) => {
      if (active) {
        setSettings(value)
        setNotice('修改会立即应用到独立字幕浮层')
      }
    })
    const unsubscribe = api.onSettingsChanged((value) => active && setSettings(value))
    return () => { active = false; unsubscribe() }
  }, [api])

  const updateOverlay = async (patch: Partial<OverlaySettings>): Promise<void> => {
    if (!api) return
    const optimistic = { ...settings, overlay: { ...settings.overlay, ...patch } }
    setSettings(optimistic)
    try {
      setSettings(await api.updateSettings({ overlay: patch }))
      setNotice('设置已保存')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '设置保存失败')
    }
  }

  const overlay = settings.overlay
  return (
    <div className="page">
      <header className="page-heading"><div><h1>外观</h1><p>{notice}</p></div><button className="button secondary-button" onClick={() => void api?.showOverlay()} type="button">显示浮层</button></header>
      <div className="settings-layout">
        <section className="surface settings-surface">
          <h2>字幕样式</h2>
          <label><span>应用主题</span><select value={settings.theme} onChange={(event) => void api?.updateSettings({ theme: event.target.value as AppSettings['theme'] }).then(setSettings)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
          <label><span>字体</span><select value={overlay.fontFamily} onChange={(event) => void updateOverlay({ fontFamily: event.target.value })}><option>Segoe UI Variable</option><option>Microsoft YaHei UI</option><option>等线</option></select></label>
          <label><span>浮层位置</span><select value={overlay.mode} onChange={(event) => void updateOverlay({ mode: event.target.value as OverlaySettings['mode'] })}><option value="bottom">屏幕底部</option><option value="top">屏幕顶部</option><option value="free">自由位置</option></select></label>
          <label><span>字号 · {overlay.fontSize} px</span><input type="range" min="14" max="72" value={overlay.fontSize} onChange={(event) => void updateOverlay({ fontSize: Number(event.target.value) })} /></label>
          <label><span>字重 · {overlay.fontWeight}</span><input type="range" min="300" max="800" step="100" value={overlay.fontWeight} onChange={(event) => void updateOverlay({ fontWeight: Number(event.target.value) })} /></label>
          <label><span>背景不透明度 · {Math.round(overlay.backgroundOpacity * 100)}%</span><input type="range" min="20" max="100" value={overlay.backgroundOpacity * 100} onChange={(event) => void updateOverlay({ backgroundOpacity: Number(event.target.value) / 100 })} /></label>
          <label><span>最大行数 · {overlay.maxLines}</span><input type="range" min="1" max="10" value={overlay.maxLines} onChange={(event) => void updateOverlay({ maxLines: Number(event.target.value) })} /></label>
          <label className="color-label"><span>原文颜色</span><input aria-label="原文颜色" type="color" value={overlay.sourceColor} onChange={(event) => void updateOverlay({ sourceColor: event.target.value })} /></label>
          <label className="color-label"><span>译文颜色</span><input aria-label="译文颜色" type="color" value={overlay.translationColor} onChange={(event) => void updateOverlay({ translationColor: event.target.value })} /></label>
          <label className="switch-label"><input checked={overlay.showSource} onChange={(event) => void updateOverlay({ showSource: event.target.checked })} type="checkbox" />显示原文</label>
          <label className="switch-label"><input checked={overlay.showTranslation} onChange={(event) => void updateOverlay({ showTranslation: event.target.checked })} type="checkbox" />显示译文</label>
          <label className="switch-label"><input checked={overlay.alwaysOnTop} onChange={(event) => void updateOverlay({ alwaysOnTop: event.target.checked })} type="checkbox" />始终置顶</label>
          <label className="switch-label"><input checked={overlay.locked} onChange={(event) => void updateOverlay({ locked: event.target.checked })} type="checkbox" />锁定并点击穿透</label>
        </section>
        <CaptionPreview sourceVisible={overlay.showSource} translationVisible={overlay.showTranslation} />
      </div>
    </div>
  )
}
