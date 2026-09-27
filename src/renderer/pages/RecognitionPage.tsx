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
          <div className="card-heading-row"><h2>Qwen3-ASR 1.7B</h2><span className="badge">{t("推荐")}</span></div>
          <p>{t("Qwen3-ASR 1.7B 本地流式识别，边说边显示中间结果。")}</p>
          <ul className="feature-list">
            <li><CheckmarkCircleRegular aria-hidden />{t("本地流式识别")}</li>
            <li><CheckmarkCircleRegular aria-hidden />{t("多语言")}</li>
            <li><CheckmarkCircleRegular aria-hidden />{t("加载时 NF4 4-bit 量化运行")}</li>
            <li><CheckmarkCircleRegular aria-hidden />{t("安装后可离线")}</li>
            <li><CheckmarkCircleRegular aria-hidden />{t("首条中间字幕约需 2 秒语音加推理时间")}</li>
          </ul>
          <span className="secondary-text">{t("请先在“模型与资源”页面安装")}</span>
        </section>
      </div>
    </div>
  )
}
