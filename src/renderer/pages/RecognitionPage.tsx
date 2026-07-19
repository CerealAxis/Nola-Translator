import { CheckmarkCircleRegular, MicRegular } from '@fluentui/react-icons'

export function RecognitionPage(): React.JSX.Element {
  return (
    <div className="page">
      <header className="page-heading">
        <div><h1>语音识别</h1><p>根据内容类型，在延迟和准确率之间切换。</p></div>
      </header>
      <div className="choice-grid">
        <section className="surface choice-card selected-choice">
          <div className="choice-icon"><MicRegular aria-hidden /></div>
          <div className="card-heading-row"><h2>实时模式</h2><span className="badge">推荐</span></div>
          <p>sherpa-onnx 流式模型，边说边显示中间结果。</p>
          <ul className="feature-list"><li><CheckmarkCircleRegular aria-hidden />目标首字延迟低于 1 秒</li><li><CheckmarkCircleRegular aria-hidden />适合直播、视频和日常对话</li></ul>
          <button className="button primary-button" type="button">正在使用</button>
        </section>
        <section className="surface choice-card">
          <div className="choice-icon"><MicRegular aria-hidden /></div>
          <div className="card-heading-row"><h2>高精度模式</h2><span className="badge">GPU 可用</span></div>
          <p>faster-whisper 完整语音片段识别，适合课程和会议。</p>
          <ul className="feature-list"><li><CheckmarkCircleRegular aria-hidden />RTX 4060 可使用 FP16</li><li><CheckmarkCircleRegular aria-hidden />失败时自动回退 CPU</li></ul>
          <button className="button secondary-button" type="button">切换模式</button>
        </section>
      </div>
    </div>
  )
}
