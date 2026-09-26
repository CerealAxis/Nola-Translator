import { useEffect, useRef, useState } from 'react'

import { DEFAULT_SETTINGS, type AppSettings, type OverlaySettings } from '../../shared/settings'
import { CaptionPreview } from '../components/CaptionPreview'

function NativeColorInput({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const commit = (): void => onCommit(input.value)
    // 使用原生 change 事件：系统色板关闭后才保存，避免 React 受控重绘把色板关掉。
    input.addEventListener('change', commit)
    return () => input.removeEventListener('change', commit)
  }, [onCommit])

  useEffect(() => {
    const input = inputRef.current
    if (input && document.activeElement !== input) input.value = value
  }, [value])

  return <input ref={inputRef} aria-label={label} defaultValue={value} type="color" />
}

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

  const showOverlay = async (): Promise<void> => {
    if (!api) return
    try {
      await api.showOverlay()
      setNotice('字幕浮层已显示')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '显示浮层失败')
    }
  }

  const hideOverlay = async (): Promise<void> => {
    if (!api) return
    try {
      await api.hideOverlay()
      setNotice('字幕浮层已隐藏')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '隐藏浮层失败')
    }
  }

  const beginOverlayAdjustment = async (): Promise<void> => {
    if (!api) return
    try {
      const next = await api.updateSettings({ overlay: { mode: 'free', locked: false } })
      setSettings(next)
      await api.showOverlay()
      setNotice('调整模式：拖动浮层移动，拖动窗口边缘或右下角改变大小')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法进入浮层调整模式')
    }
  }

  const finishOverlayAdjustment = async (): Promise<void> => {
    if (!api) return
    try {
      setSettings(await api.updateSettings({ overlay: { locked: true } }))
      setNotice('位置和大小已保存，字幕浮层已锁定')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法完成浮层调整')
    }
  }

  const applySubtitleScheme = async (colorScheme: OverlaySettings['colorScheme']): Promise<void> => {
    const isDark = colorScheme === 'dark'
    await updateOverlay({
      colorScheme,
      backgroundColor: isDark ? '#202020' : '#F3F3F3',
      sourceColor: isDark ? '#FFFFFF' : '#1B1B1B',
      translationColor: isDark ? '#D6E9FF' : '#005FB8',
    })
  }

  const overlay = settings.overlay
  const isAdjusting = overlay.mode === 'free' && !overlay.locked
  return (
    <div className="page">
      <header className="page-heading">
        <div><h1>外观</h1><p>{notice}</p></div>
        <div className="button-row overlay-page-actions">
          {isAdjusting
            ? <button className="button primary-button" onClick={() => void finishOverlayAdjustment()} type="button">完成调整</button>
            : <button className="button primary-button" onClick={() => void beginOverlayAdjustment()} type="button">调整位置和大小</button>}
          <button className="button secondary-button" onClick={() => void showOverlay()} type="button">显示浮层</button>
          <button className="button secondary-button" onClick={() => void hideOverlay()} type="button">隐藏浮层</button>
        </div>
      </header>
      <div className="settings-layout">
        <section className="surface settings-surface">
          <h2>字幕样式</h2>
          <label><span>字幕主题</span><select aria-label="字幕主题" value={overlay.colorScheme} onChange={(event) => void applySubtitleScheme(event.target.value as OverlaySettings['colorScheme'])}><option value="dark">深色字幕（浅色文字）</option><option value="light">浅色字幕（深色文字）</option></select></label>
          <label><span>字体</span><select value={overlay.fontFamily} onChange={(event) => void updateOverlay({ fontFamily: event.target.value })}><option>Segoe UI Variable</option><option>Microsoft YaHei UI</option><option>等线</option></select></label>
          <label><span>浮层位置</span><select value={overlay.mode} onChange={(event) => void updateOverlay({ mode: event.target.value as OverlaySettings['mode'] })}><option value="bottom">屏幕底部</option><option value="top">屏幕顶部</option><option value="free">自由位置</option></select></label>
          <fieldset className="subtitle-typography-group">
            <legend>原文排版</legend>
            <label><span>字号 · {overlay.fontSize} px</span><input type="range" min="14" max="72" value={overlay.fontSize} onChange={(event) => void updateOverlay({ fontSize: Number(event.target.value) })} /></label>
            <label><span>字重 · {overlay.fontWeight}</span><input type="range" min="300" max="800" step="100" value={overlay.fontWeight} onChange={(event) => void updateOverlay({ fontWeight: Number(event.target.value) })} /></label>
            <label><span>最大行数 · {overlay.maxLines}</span><input type="range" min="1" max="10" value={overlay.maxLines} onChange={(event) => void updateOverlay({ maxLines: Number(event.target.value) })} /></label>
            <label><span>行距 · {overlay.lineHeight.toFixed(2)}</span><input type="range" min="1" max="2" step="0.05" value={overlay.lineHeight} onChange={(event) => void updateOverlay({ lineHeight: Number(event.target.value) })} /></label>
          </fieldset>
          <fieldset className="subtitle-typography-group">
            <legend>译文排版</legend>
            <label><span>字号 · {overlay.translationFontSize} px</span><input type="range" min="12" max="72" value={overlay.translationFontSize} onChange={(event) => void updateOverlay({ translationFontSize: Number(event.target.value) })} /></label>
            <label><span>字重 · {overlay.translationFontWeight}</span><input type="range" min="300" max="800" step="100" value={overlay.translationFontWeight} onChange={(event) => void updateOverlay({ translationFontWeight: Number(event.target.value) })} /></label>
            <label><span>最大行数 · {overlay.translationMaxLines}</span><input type="range" min="1" max="10" value={overlay.translationMaxLines} onChange={(event) => void updateOverlay({ translationMaxLines: Number(event.target.value) })} /></label>
            <label><span>行距 · {overlay.translationLineHeight.toFixed(2)}</span><input type="range" min="1" max="2" step="0.05" value={overlay.translationLineHeight} onChange={(event) => void updateOverlay({ translationLineHeight: Number(event.target.value) })} /></label>
          </fieldset>
          <label><span>背景不透明度 · {Math.round(overlay.backgroundOpacity * 100)}%</span><input type="range" min="0" max="100" value={overlay.backgroundOpacity * 100} onChange={(event) => void updateOverlay({ backgroundOpacity: Number(event.target.value) / 100 })} /></label>
          <label className="color-label"><span>原文颜色</span><NativeColorInput label="原文颜色" value={overlay.sourceColor} onCommit={(sourceColor) => void updateOverlay({ sourceColor })} /></label>
          <label className="color-label"><span>译文颜色</span><NativeColorInput label="译文颜色" value={overlay.translationColor} onCommit={(translationColor) => void updateOverlay({ translationColor })} /></label>
          <label className="switch-label"><input checked={overlay.showSource} onChange={(event) => void updateOverlay({ showSource: event.target.checked })} type="checkbox" />显示原文</label>
          <label className="switch-label"><input checked={overlay.showTranslation} onChange={(event) => void updateOverlay({ showTranslation: event.target.checked })} type="checkbox" />显示译文</label>
          <label className="switch-label"><input checked={overlay.alwaysOnTop} onChange={(event) => void updateOverlay({ alwaysOnTop: event.target.checked })} type="checkbox" />始终置顶</label>
          <label className="switch-label"><input checked={overlay.locked} onChange={(event) => void updateOverlay({ locked: event.target.checked })} type="checkbox" />锁定并点击穿透</label>
          <p className="setting-hint">主程序始终跟随 Windows 主题。调整位置和大小时，拖动字幕区域移动、拖动浮层窗口边缘缩放；完成操作请回到本页。</p>
        </section>
        <CaptionPreview overlay={overlay} sourceVisible={overlay.showSource} translationVisible={overlay.showTranslation} />
      </div>
    </div>
  )
}
