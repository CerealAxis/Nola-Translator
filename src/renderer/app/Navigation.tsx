import { useEffect, useState, type ComponentType } from 'react'
import {
  ClosedCaptionRegular,
  ColorRegular,
  HistoryRegular,
  LocalLanguageRegular,
  MicRegular,
  PulseRegular,
  SettingsRegular
} from '@fluentui/react-icons'

export type PageId =
  | 'captions'
  | 'recognition'
  | 'translation'
  | 'appearance'
  | 'history'
  | 'diagnostics'

type NavigationProps = {
  activePage: PageId
  onNavigate: (page: PageId) => void
}

type NavigationItem = {
  id: PageId
  label: string
  icon: ComponentType<{ 'aria-hidden'?: boolean }>
}

const navigationItems: NavigationItem[] = [
  { id: 'captions', label: '实时字幕', icon: ClosedCaptionRegular },
  { id: 'recognition', label: '语音识别', icon: MicRegular },
  { id: 'translation', label: '翻译', icon: LocalLanguageRegular },
  { id: 'appearance', label: '外观', icon: ColorRegular },
  { id: 'history', label: '历史记录', icon: HistoryRegular },
  { id: 'diagnostics', label: '诊断', icon: PulseRegular }
]

export function Navigation({ activePage, onNavigate }: NavigationProps): React.JSX.Element {
  const [engineStatus, setEngineStatus] = useState('正在连接引擎')
  useEffect(() => {
    const api = window.fluentCaptions
    if (!api) {
      setEngineStatus('引擎接口不可用')
      return
    }
    void api.getDiagnostics().then((value) => {
      const state = String(value['引擎状态'] ?? '')
      setEngineStatus(state === 'ready' ? '引擎已就绪' : state === 'failed' ? '引擎启动失败' : `引擎${state || '正在启动'}`)
    })
    return api.onEngineEvent((event) => {
      if (event.type === 'ready') setEngineStatus('引擎已就绪')
      else if (event.type === 'sessionStarted') setEngineStatus('引擎正在识别')
      else if (event.type === 'sessionStopped') setEngineStatus('引擎已就绪')
      else if (event.type === 'error' && !event.recoverable) setEngineStatus('引擎发生错误')
    })
  }, [])
  return (
    <nav className="navigation" aria-label="主导航">
      <div className="navigation-items">
        {navigationItems.map(({ id, label, icon: Icon }) => (
          <button
            className="navigation-item"
            data-active={activePage === id}
            aria-current={activePage === id ? 'page' : undefined}
            aria-label={label}
            key={id}
            onClick={() => onNavigate(id)}
            type="button"
          >
            <Icon aria-hidden />
            <span className="navigation-label">{label}</span>
          </button>
        ))}
      </div>

      <div className="navigation-footer">
        <button className="navigation-item" onClick={() => onNavigate('appearance')} type="button" aria-label="设置">
          <SettingsRegular aria-hidden />
          <span className="navigation-label">设置</span>
        </button>
        <div className="engine-ready">
          <span className="status-dot" aria-hidden="true" />
          <span className="navigation-label">{engineStatus}</span>
        </div>
      </div>
    </nav>
  )
}
