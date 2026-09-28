import { useI18n } from '../i18n'
import { CheckmarkCircleRegular, MicRegular } from '@fluentui/react-icons'

const MODELS = [
  {
    id: 'Qwen3-ASR 1.7B',
    size: '约 4.1 GB',
    note: 'Qwen3-ASR 1.7B 本地流式识别，边说边显示中间结果。',
    features: ['本地流式识别', '多语言', '加载时 NF4 4-bit 量化运行', '安装后可离线'],
  },
  {
    id: 'Qwen3-ASR 0.6B',
    size: '约 1.9 GB',
    note: 'Qwen3-ASR 0.6B 与 1.7B 同系列，体积更小、加载更快。',
    features: ['本地流式识别', '多语言', '加载时 NF4 4-bit 量化运行', '安装后可离线'],
  },
  {
    id: 'SenseVoiceSmall',
    size: '约 937 MB',
    note: 'SenseVoiceSmall 非自回归识别，中日韩粤英五语，推理快、占用低。',
    features: ['本地流式识别', '中日韩粤英五语', '无需量化，加载即用', '安装后可离线'],
  },
] as const

export function RecognitionPage(): React.JSX.Element {
  const { t } = useI18n()
  return (
    <div className="page">
      <header className="page-heading">
        <div><h1>{t("语音识别")}</h1><p>{t("根据内容类型，在延迟和准确率之间切换。")}</p></div>
      </header>
      <div className="choice-grid">
        {MODELS.map((model, index) => (
          <section className="surface choice-card" key={model.id}>
            <div className="choice-icon"><MicRegular aria-hidden /></div>
            <div className="card-heading-row"><h2>{model.id}</h2>{index === 0 && <span className="badge">{t("推荐")}</span>}</div>
            <p>{t(model.note)}</p>
            <ul className="feature-list">
              {model.features.map((feature) => (
                <li key={feature}><CheckmarkCircleRegular aria-hidden />{t(feature)}</li>
              ))}
              <li><CheckmarkCircleRegular aria-hidden />{model.size}</li>
            </ul>
            <span className="secondary-text">{t("请先在“模型与资源”页面安装")}</span>
          </section>
        ))}
      </div>
    </div>
  )
}
