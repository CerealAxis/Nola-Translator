/** A single brand header; native Windows controls own their reserved region. */
import { useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Button, Dropdown, Tooltip, useTheme } from '@heroui/react'
import { CircleHelp, Languages, Moon, Sun, Minus, Square, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useRoute } from '@/routes'
import { settingsStore, updateSettings, useStore } from '@/store'
import { NolaLogo } from './NolaLogo'

export type TitleBarVariant = 'brand' | 'session'
export interface TitleBarHelpItem { key: string; label: ReactNode; onSelect: () => void }
export interface TitleBarProps {
  variant?: TitleBarVariant
  sessionTitle?: ReactNode
  status?: ReactNode
  timer?: ReactNode
  actions?: ReactNode
  leading?: ReactNode
  helpItems?: TitleBarHelpItem[]
  className?: string
}
export function TitleBar({ variant = 'brand', sessionTitle, status, timer, actions, leading, helpItems, className = '' }: TitleBarProps) {
  const { t, language, setLanguage } = useI18n()
  const { navigate } = useRoute()
  const { resolved, setTheme } = useNolaTheme()
  const native = isElectronShell()
  const dark = resolved === 'dark'
  // **只有两项，没有「跟随系统」。** 语言是 `AppSettings.uiLanguage`，主进程的 zod schema
  // 是 `z.enum(['zh-CN','en'])`，多一个 `'system'` 会让设置写不进去。
  // （原型那版有第三项，走的是 localStorage + navigator.language，与主仓的设置模型无关。）
  const options = [
    { id: 'zh-CN' as const, label: t('language.zhCN') },
    { id: 'en' as const, label: t('language.en') },
  ]
  const help = helpItems ?? [
    { key: 'settings', label: t('nav.settings'), onSelect: () => navigate('#/settings/general') },
    /*
     * 第二项写「高级」，**不要写「反馈问题」**。
     *
     * `app:feedback` 通道主进程没有（`bridge/contract.ts` 的 `BRIDGE_TIERS` 里
     * `feedback.submit` 是 `ipc-new`，`ipcBridge` 对它显式 reject），原型那套反馈对话框
     * 整个没迁过来：`help.feedback*` 三十来个键全是死键，设置页的「问题反馈」分组里只有
     * 「复制诊断信息」与「恢复出厂设置」，没有任何能提交反馈的东西。菜单项承诺一个做不到的
     * 动作，比不写更糟，所以这里就写它真正带你去的地方。
     */
    { key: 'advanced', label: t('modelsSettingsUi.advanced'), onSelect: () => navigate('#/settings/advanced') },
  ]
  return (
    <header className={`nola-titlebar nola-drag z-titlebar-drag ${className}`}>
      <div className="nola-brand">
        <NolaLogo size={36} title={null} />
        <span>{t('app.name')}</span>
      </div>
      {variant === 'session' ? <div className="nola-no-drag flex min-w-0 items-center gap-3">{leading}{sessionTitle}{status}{timer}</div> : null}
      <div className="nola-titlebar-tools nola-no-drag">
        {actions}
        <Dropdown>
          <Dropdown.Trigger className="nola-titlebar-icon" aria-label={t('titleBar.language')}><Languages aria-hidden="true" /></Dropdown.Trigger>
          <Dropdown.Popover>
            <Dropdown.Menu selectionMode="single" selectedKeys={new Set([language])}>
              {options.map(option => <Dropdown.Item key={option.id} id={option.id} textValue={option.label} onAction={() => setLanguage(option.id)}>{option.label}<Dropdown.ItemIndicator type="checkmark" /></Dropdown.Item>)}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
        {/* 主题是一个按钮而不是两个：图标表示**当前**主题，点了切到另一个。
            两个并排按钮会让人以为要"选中"某一侧，而不是"翻到另一侧"，而且顶栏右侧
            已经挤了语言和帮助，文案改成动作名（切换到深色）后不用猜按下会发生什么。 */}
        <Tooltip delay={800}>
          <Button isIconOnly variant="ghost" className="nola-titlebar-icon" aria-label={dark ? t('titleBar.themeToLight') : t('titleBar.themeToDark')} onPress={() => setTheme(dark ? 'light' : 'dark')}>{dark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}</Button>
          <Tooltip.Content>{dark ? t('titleBar.themeToLight') : t('titleBar.themeToDark')}</Tooltip.Content>
        </Tooltip>
        <Dropdown>
          <Dropdown.Trigger className="nola-titlebar-icon" aria-label={t('titleBar.helpMenu')}><CircleHelp aria-hidden="true" /></Dropdown.Trigger>
          <Dropdown.Popover><Dropdown.Menu>{help.map(item => <Dropdown.Item key={item.key} id={item.key} onAction={item.onSelect}>{item.label}</Dropdown.Item>)}</Dropdown.Menu></Dropdown.Popover>
        </Dropdown>
      </div>
      {native ? <div className="nola-native-controls" aria-hidden="true" /> : (
        <div className="nola-web-controls nola-no-drag">
          <Button variant="ghost" isIconOnly isDisabled aria-label={t('shellUi.minimize')}><Minus aria-hidden="true" /></Button>
          <Button variant="ghost" isIconOnly aria-label={t('shellUi.fullscreen')} onPress={() => { if(document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.() }}><Square aria-hidden="true" /></Button>
          <Button variant="ghost" isIconOnly isDisabled aria-label={t('common.close')}><X aria-hidden="true" /></Button>
        </div>
      )}
    </header>
  )
}
export type NolaThemePreference = 'system' | 'light' | 'dark'
export interface NolaThemeController {
  theme: NolaThemePreference
  resolved: string | undefined
  setTheme: (next: NolaThemePreference) => void
}

/**
 * 这个文档跑在 Electron 主窗里吗？
 *
 * 原型写的是 `Boolean(window.nolaDesktop)` —— **主仓没有 `nolaDesktop` 这个全局**
 * （preload 只注入 `nolaTranslator`），所以那一行恒为 false，标题栏右侧会画出一排
 * 禁用的「最小化 / 全屏 / 关闭」假按钮，而真正的原生窗口控件区域留成空白。
 * 判据改成 preload 桥接在不在：它在就说明我们在 Electron 里，窗口是 frameless 的，
 * 系统控件占用标题栏右侧那块保留区。
 */
function isElectronShell(): boolean {
  return typeof window !== 'undefined' && Boolean(window.nolaTranslator)
}

export function useNolaTheme(): NolaThemeController {
  const { theme: local, resolvedTheme, setTheme: applyTheme } = useTheme()
  const persisted = useStore(settingsStore, state => state.settings?.theme)
  const preference: NolaThemePreference = persisted ?? (isPreference(local) ? local : 'system')
  useEffect(() => { if (persisted && persisted !== local) applyTheme(persisted) }, [persisted, local, applyTheme])
  const setTheme = useCallback((next: NolaThemePreference) => {
    applyTheme(next)
    void updateSettings({ theme: next }).catch(() => applyTheme(preference))
  }, [applyTheme, preference])
  return { theme: preference, resolved: resolvedTheme, setTheme }
}
function isPreference(value: string): value is NolaThemePreference { return value === 'system' || value === 'light' || value === 'dark' }
