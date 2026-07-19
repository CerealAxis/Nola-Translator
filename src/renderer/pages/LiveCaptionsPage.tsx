import { useState } from 'react'
import { ClosedCaptionRegular, PlayRegular, StopRegular } from '@fluentui/react-icons'

import { CaptionPreview } from '../components/CaptionPreview'

export function LiveCaptionsPage(): React.JSX.Element {
  const [listening, setListening] = useState(false)
  const [sourceVisible, setSourceVisible] = useState(true)
  const [translationVisible, setTranslationVisible] = useState(true)

  return (
    <div className="page live-page">
      <header className="page-heading">
        <div>
          <h1>实时字幕</h1>
          <p>在本机识别系统声音，并翻译成你需要的语言。</p>
        </div>
        <button className="button secondary-button" type="button">
          <ClosedCaptionRegular aria-hidden /> 字幕浮层
        </button>
      </header>

      <div className="live-layout">
        <section className="surface session-card">
          <div className="card-heading-row">
            <div>
              <h2>新建字幕会话</h2>
              <p>模型准备完成后，可完全离线运行。</p>
            </div>
            <span className="badge">本地优先</span>
          </div>

          <div className="form-grid">
            <label>
              <span>音频来源</span>
              <select aria-label="音频来源" defaultValue="system">
                <option value="system">系统声音（默认扬声器）</option>
                <option value="microphone">麦克风阵列（Realtek Audio）</option>
              </select>
            </label>
            <label>
              <span>识别模式</span>
              <select aria-label="识别模式" defaultValue="realtime">
                <option value="realtime">实时模式 · 低延迟</option>
                <option value="accurate">高精度模式 · Whisper</option>
              </select>
            </label>
            <label>
              <span>源语言</span>
              <select aria-label="源语言" defaultValue="auto">
                <option value="auto">自动识别</option>
                <option value="zh">中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
              </select>
            </label>
            <label>
              <span>主要翻译语言</span>
              <select aria-label="主要翻译语言" defaultValue="zh">
                <option value="zh">中文（简体）</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
              </select>
            </label>
          </div>

          <fieldset className="display-options">
            <legend>显示内容</legend>
            <label className="checkbox-label">
              <input
                checked={sourceVisible}
                onChange={(event) => setSourceVisible(event.target.checked)}
                type="checkbox"
              />
              原文
            </label>
            <label className="checkbox-label">
              <input
                checked={translationVisible}
                onChange={(event) => setTranslationVisible(event.target.checked)}
                type="checkbox"
              />
              简体中文译文
            </label>
            <button className="text-button" type="button">＋ 添加语言</button>
          </fieldset>

          <footer className="session-footer">
            <div className={`audio-level ${listening ? 'is-active' : ''}`} aria-hidden="true">
              <i /><i /><i /><i /><i />
            </div>
            <div className="session-status" role="status" aria-live="polite">
              <span className="status-dot" aria-hidden="true" />
              {listening ? '正在监听系统声音' : '准备就绪'}
            </div>
            <button
              className={`button ${listening ? 'secondary-button' : 'primary-button'} start-button`}
              onClick={() => setListening((value) => !value)}
              type="button"
            >
              {listening ? <StopRegular aria-hidden /> : <PlayRegular aria-hidden />}
              {listening ? '停止字幕' : '开始字幕'}
            </button>
          </footer>
        </section>

        <CaptionPreview
          listening={listening}
          sourceVisible={sourceVisible}
          translationVisible={translationVisible}
        />
      </div>
    </div>
  )
}
