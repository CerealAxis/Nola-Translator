/** A single brand header; native Windows controls own their reserved region. */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Dropdown, Tooltip, useTheme } from '@heroui/react'
import { CircleHelp, Languages, Moon, Sun, Minus, Square, Copy, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useRoute } from '@/routes'
import { settingsStore, updateSettings, useStore } from '@/store'
import nolaLogoUrl from '../../../../assets/brand/nola-logo.svg'

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
  const windowsShell = native && window.nolaTranslator?.isWindows === true
  const [maximized, setMaximized] = useState(false)
  const dark = resolved === 'dark'
  useEffect(() => {
    const bridge = window.nolaTranslator
    if (!bridge?.isWindows) return
    const unsubscribe = bridge.onMainWindowMaximizedChanged(setMaximized)
    void bridge.isMainWindowMaximized().then(setMaximized).catch(() => undefined)
    return unsubscribe
  }, [])
  const toggleMaximize = () => {
    void window.nolaTranslator?.toggleMainWindowMaximize().then(setMaximized).catch(() => undefined)
  }
  const options = [
    { id: 'zh-CN' as const, label: t('language.zhCN') },
    { id: 'en' as const, label: t('language.en') },
  ]
  const help = helpItems ?? [
    { key: 'settings', label: t('nav.settings'), onSelect: () => navigate('#/settings/general') },
    { key: 'advanced', label: t('modelsSettingsUi.advanced'), onSelect: () => navigate('#/settings/advanced') },
  ]
  return (
    <header className={`nola-titlebar nola-drag z-titlebar-drag ${className}`} onDoubleClick={event => {
      if (windowsShell && !(event.target instanceof Element && event.target.closest('.nola-no-drag'))) toggleMaximize()
    }}>
      <div className="nola-brand">
        <img className="nola-brand__mark" src={nolaLogoUrl} alt={t('app.name')} />
      </div>
      {variant === 'session' ? <div className="nola-no-drag flex min-w-0 items-center gap-3">{leading}{sessionTitle}{status}{timer}</div> : null}
      <div className={`nola-titlebar-tools nola-no-drag${windowsShell ? ' nola-titlebar-tools--windows' : ''}`}>
        {actions}
        <Dropdown>
          <Dropdown.Trigger className="nola-titlebar-icon" aria-label={t('titleBar.language')}><Languages aria-hidden="true" /></Dropdown.Trigger>
          <Dropdown.Popover>
            <Dropdown.Menu selectionMode="single" selectedKeys={new Set([language])}>
              {options.map(option => <Dropdown.Item key={option.id} id={option.id} textValue={option.label} onAction={() => setLanguage(option.id)}>{option.label}<Dropdown.ItemIndicator type="checkmark" /></Dropdown.Item>)}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
        {/*
          * The icon already shows the current theme, so this is
            a single toggle, not a pair of them. */}
        <Tooltip delay={800}>
          <Button isIconOnly variant="ghost" className="nola-titlebar-icon" aria-label={dark ? t('titleBar.themeToLight') : t('titleBar.themeToDark')} onPress={() => setTheme(dark ? 'light' : 'dark')}>{dark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}</Button>
          <Tooltip.Content>{dark ? t('titleBar.themeToLight') : t('titleBar.themeToDark')}</Tooltip.Content>
        </Tooltip>
        <Dropdown>
          <Dropdown.Trigger className="nola-titlebar-icon" aria-label={t('titleBar.helpMenu')}><CircleHelp aria-hidden="true" /></Dropdown.Trigger>
          <Dropdown.Popover><Dropdown.Menu>{help.map(item => <Dropdown.Item key={item.key} id={item.key} onAction={item.onSelect}>{item.label}</Dropdown.Item>)}</Dropdown.Menu></Dropdown.Popover>
        </Dropdown>
      </div>
      {windowsShell ? <div className="nola-window-controls nola-no-drag">
        <Button variant="ghost" isIconOnly className="nola-window-control" aria-label={t('titleBar.minimizeWindow')} title={t('titleBar.minimizeWindow')} onPress={() => { void window.nolaTranslator?.minimizeMainWindow() }}><Minus aria-hidden="true" /></Button>
        <Button variant="ghost" isIconOnly className="nola-window-control" aria-label={maximized ? t('titleBar.restoreWindow') : t('titleBar.maximizeWindow')} title={maximized ? t('titleBar.restoreWindow') : t('titleBar.maximizeWindow')} onPress={toggleMaximize}>{maximized ? <Copy aria-hidden="true" /> : <Square aria-hidden="true" />}</Button>
        <Button variant="ghost" isIconOnly className="nola-window-control nola-window-control--close" aria-label={t('titleBar.closeWindow')} title={t('titleBar.closeWindow')} onPress={() => { void window.nolaTranslator?.closeMainWindow() }}><X aria-hidden="true" /></Button>
      </div> : native ? <div className="nola-native-controls" aria-hidden="true" /> : (
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
 * True inside the Electron shell, where the window is frameless and the OS
 * controls own the reserved strip on the right. `nolaTranslator` is the only
 * global the preload injects, so its presence is the test.
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
