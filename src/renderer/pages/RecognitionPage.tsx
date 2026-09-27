import { useI18n } from '../i18n'
import { CheckmarkCircleRegular, MicRegular } from '@fluentui/react-icons'

export function RecognitionPage(): React.JSX.Element {
  const { t } = useI18n()
  return (
    <div className="page">
      <header className="page-heading">
        <div><h1>{t("语音识别")}</h1><p>{t("根据内容类型，在延迟和准确率之间切换。")}</p></div>
      </header>
      <div className="choice-grid">
        <section className="surface choice-card">
          <div className="choice-icon"><MicRegular aria-hidden /></div>
          <div className="card-heading-row"><h2>SenseVoiceSmall</h2><span className="badge">{t("推荐")}</span></div>
          <p>{t("sherpa-onnx SenseVoiceSmall，VAD 期间持续输出中间字幕，覆盖中文、粤语、English、日本語和 한국어。")}</p>
          <ul className="feature-list"><li><CheckmarkCircleRegular aria-hidden />{t("识别准确率与多语言覆盖更均衡")}</li><li><CheckmarkCircleRegular aria-hidden />{t("句子结束时输出带标点的最终结果")}</li></ul>
          <span className="secondary-text">{t("请先在“模型与语言包”页面安装并选择")}</span>
        </section>
        <section className="surface choice-card">
          <div className="choice-icon"><MicRegular aria-hidden /></div>
          <div className="card-heading-row"><h2>{t("实时模式")}</h2><span className="badge">{t("推荐")}</span></div>
          <p>{t("sherpa-onnx 流式模型，边说边显示中间结果。")}</p>
          <ul className="feature-list"><li><CheckmarkCircleRegular aria-hidden />{t("目标首字延迟低于 1 秒")}</li><li><CheckmarkCircleRegular aria-hidden />{t("适合直播、视频和日常对话")}</li></ul>
          <span className="secondary-text">{t("在“模型与语言包”页面安装后选择")}</span>
        </section>
        <section className="surface choice-card">
          <div className="choice-icon"><MicRegular aria-hidden /></div>
          <div className="card-heading-row"><h2>{t("高精度模式")}</h2><span className="badge">{t("自动检测 GPU")}</span></div>
          <p>{t("faster-whisper 完整语音片段识别，适合课程和会议。")}</p>
          <ul className="feature-list"><li><CheckmarkCircleRegular aria-hidden />{t("CUDA 可用时优先使用 FP16")}</li><li><CheckmarkCircleRegular aria-hidden />{t("初始化失败时自动回退 CPU INT8")}</li></ul>
          <span className="secondary-text">{t("在“模型与语言包”页面安装后选择")}</span>
        </section>
      </div>
    </div>
  )
}
