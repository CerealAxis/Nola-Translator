import type { ComponentType } from 'react'
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
        <button className="navigation-item" type="button" aria-label="设置">
          <SettingsRegular aria-hidden />
          <span className="navigation-label">设置</span>
        </button>
        <div className="engine-ready">
          <span className="status-dot" aria-hidden="true" />
          <span className="navigation-label">引擎等待接入</span>
        </div>
      </div>
    </nav>
  )
}
