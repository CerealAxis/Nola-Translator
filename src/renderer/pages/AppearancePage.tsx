import { useState } from 'react'

import { CaptionPreview } from '../components/CaptionPreview'

export function AppearancePage(): React.JSX.Element {
  const [sourceVisible, setSourceVisible] = useState(true)
  const [translationVisible, setTranslationVisible] = useState(true)

  return (
    <div className="page">
      <header className="page-heading"><div><h1>外观</h1><p>修改会即时反映在字幕浮层预览中。</p></div></header>
      <div className="settings-layout">
        <section className="surface settings-surface">
          <h2>字幕样式</h2>
          <label><span>字体</span><select defaultValue="segoe"><option value="segoe">Segoe UI Variable</option><option value="yahei">Microsoft YaHei UI</option></select></label>
          <label><span>浮层位置</span><select defaultValue="bottom"><option value="bottom">屏幕底部</option><option value="top">屏幕顶部</option><option value="free">自由位置</option></select></label>
          <label><span>字号 · 28 px</span><input type="range" min="20" max="42" defaultValue="28" /></label>
          <label><span>背景不透明度 · 82%</span><input type="range" min="35" max="100" defaultValue="82" /></label>
          <label className="switch-label"><input checked={sourceVisible} onChange={(event) => setSourceVisible(event.target.checked)} type="checkbox" />显示原文</label>
          <label className="switch-label"><input checked={translationVisible} onChange={(event) => setTranslationVisible(event.target.checked)} type="checkbox" />显示译文</label>
        </section>
        <CaptionPreview sourceVisible={sourceVisible} translationVisible={translationVisible} />
      </div>
    </div>
  )
}
