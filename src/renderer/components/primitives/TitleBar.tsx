/** A single brand header; native Windows controls own their reserved region. */
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Check, CircleHelp, Languages, Moon, Sun, Minus, Square, Copy, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useRoute } from '@/routes'
import { settingsStore, updateSettings, useStore } from '@/store'
import { Button } from '../ui/button'
import { notifyError } from '@/components/primitives/notify'
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

/** The floating surfaces; their colours come from the product theme rather than literal values. */
const MENU_POPUP_CLASS = 'z-dropdown min-w-40 rounded-nola-ui-xl bg-overlay p-1 text-overlay-foreground shadow-overlay'
const MENU_ITEM_CLASS = 'nola-menu-item flex cursor-pointer items-center justify-between gap-3 rounded-nola-ui-md px-3 py-2 text-sm'
const TOOLTIP_CLASS = 'z-popup max-w-96 whitespace-normal break-all rounded-nola-ui-xl bg-overlay p-2 text-xs text-overlay-foreground shadow-overlay'

export function TitleBar({ variant = 'brand', sessionTitle, status, timer, actions, leading, helpItems, className = '' }: TitleBarProps) {
  const { t, uiLanguage, setLanguage } = useI18n()
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
    void bridge.isMainWindowMaximized()
      .then(setMaximized)
      .catch((error: unknown) => { notifyError(t('errors.windowStateFailed'), { cause: error }) })
    return unsubscribe
  }, [t])
  const toggleMaximize = () => {
    void window.nolaTranslator?.toggleMainWindowMaximize().then(setMaximized).catch(() => undefined)
  }
  const options = [
    { id: 'auto' as const, label: t('language.auto') },
    { id: 'zh-CN' as const, label: t('language.zhCN') },
    { id: 'zh-TW' as const, label: t('language.zhTW') },
    { id: 'zh-HK' as const, label: t('language.zhHK') },
    { id: 'ko' as const, label: t('language.ko') },
    { id: 'ja' as const, label: t('language.ja') },
    { id: 'en' as const, label: t('language.en') },
  ]
  const help = helpItems ?? [
    { key: 'settings', label: t('nav.settings'), onSelect: () => navigate('#/settings/general') },
    { key: 'advanced', label: t('modelsSettingsUi.advanced'), onSelect: () => navigate('#/settings/advanced') },
    { key: 'more', label: t('more.tabLabel'), onSelect: () => navigate('#/settings/more') },
  ]
  const selectLanguage = (value: string) => {
    const option = options.find(item => item.id === value)
    if (!option) return
    void setLanguage(option.id).catch((error: unknown) => {
      notifyError(t('errors.languageChangeFailed'), { cause: error })
    })
  }
  return (
    <header className={`nola-titlebar nola-drag z-sticky${windowsShell ? ' nola-titlebar--windows' : ''} ${className}`} onDoubleClick={event => {
      if (windowsShell && !(event.target instanceof Element && event.target.closest('.nola-no-drag'))) toggleMaximize()
    }}>
      <div className="nola-brand">
        <img className="nola-brand__mark" src={nolaLogoUrl} alt={t('app.name')} />
      </div>
      {variant === 'session' ? <div className="nola-no-drag flex min-w-0 items-center gap-3">{leading}{sessionTitle}{status}{timer}</div> : null}
      <div className={`nola-titlebar-tools nola-no-drag${windowsShell ? ' nola-titlebar-tools--windows' : ''}`}>
        {actions}
        <Menu.Root>
          <Menu.Trigger render={<Button variant="secondary" size="icon" className="nola-titlebar-icon" aria-label={t('titleBar.language')}>
            <Languages aria-hidden="true" />
          </Button>} />
          <Menu.Portal>
            <Menu.Positioner className="z-dropdown" sideOffset={4}>
              <Menu.Popup className={MENU_POPUP_CLASS}>
                <Menu.List>
                  <Menu.RadioGroup value={uiLanguage} onValueChange={selectLanguage}>
                    {options.map(option => (
                      <Menu.RadioItem key={option.id} value={option.id} label={option.label} closeOnClick className={MENU_ITEM_CLASS}>
                        {option.label}
                        <Menu.RadioItemIndicator><Check aria-hidden="true" className="w-4 h-4" /></Menu.RadioItemIndicator>
                      </Menu.RadioItem>
                    ))}
                  </Menu.RadioGroup>
                </Menu.List>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        {/*
          * The icon already shows the current theme, so this is
            a single toggle, not a pair of them. */}
        <Tooltip>
          <TooltipTrigger delay={800} render={<Button variant="secondary" size="icon" className="nola-titlebar-icon" aria-label={dark ? t('titleBar.themeToLight') : t('titleBar.themeToDark')} onClick={() => setTheme(dark ? 'light' : 'dark')}>
            {dark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
          </Button>} />
          <TooltipContent sideOffset={3} className={TOOLTIP_CLASS}>{dark ? t('titleBar.themeToLight') : t('titleBar.themeToDark')}</TooltipContent>
        </Tooltip>
        {help.length > 0 && <Menu.Root>
          <Menu.Trigger render={<Button variant="secondary" size="icon" className="nola-titlebar-icon" aria-label={t('titleBar.helpMenu')}>
            <CircleHelp aria-hidden="true" />
          </Button>} />
          <Menu.Portal>
            <Menu.Positioner className="z-dropdown" sideOffset={4}>
              <Menu.Popup className={MENU_POPUP_CLASS}>
                <Menu.List>
                  {help.map(item => <Menu.Item key={item.key} className={MENU_ITEM_CLASS} onClick={item.onSelect}>{item.label}</Menu.Item>)}
                </Menu.List>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>}
      </div>
      {windowsShell ? <div className="nola-window-controls nola-no-drag">
        <Button variant="secondary" size="icon" className="nola-window-control" aria-label={t('titleBar.minimizeWindow')} onClick={() => { void window.nolaTranslator?.minimizeMainWindow() }}><Minus aria-hidden="true" /></Button>
        <Button variant="secondary" size="icon" className="nola-window-control" aria-label={maximized ? t('titleBar.restoreWindow') : t('titleBar.maximizeWindow')} onClick={toggleMaximize}>{maximized ? <Copy aria-hidden="true" /> : <Square aria-hidden="true" />}</Button>
        <Button variant="secondary" size="icon" className="nola-window-control nola-window-control--close" aria-label={t('titleBar.closeWindow')} onClick={() => { void window.nolaTranslator?.closeMainWindow() }}><X aria-hidden="true" /></Button>
      </div> : native ? <div className="nola-native-controls" aria-hidden="true" /> : (
        <div className="nola-web-controls nola-no-drag">
          <Button variant="secondary" size="icon" disabled aria-label={t('shellUi.minimize')}><Minus aria-hidden="true" /></Button>
          <Button variant="secondary" size="icon" aria-label={t('shellUi.fullscreen')} onClick={() => { if(document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.() }}><Square aria-hidden="true" /></Button>
          <Button variant="secondary" size="icon" disabled aria-label={t('common.close')}><X aria-hidden="true" /></Button>
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

/**
 * The renderer's copy of the theme preference.
 *
 * The main process owns the persisted value; this key is the hand-off with
 * `theme-boot.js`, which writes the authoritative preference before React
 * mounts so the pre-painted document and the first render agree.
 */
const THEME_STORAGE_KEY = 'heroui-theme'
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

function readStoredTheme(): NolaThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored !== null && isPreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

function storeTheme(theme: NolaThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // A document without storage still themes itself; only the mirror is lost.
  }
}

function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia?.(DARK_SCHEME_QUERY).matches ? 'dark' : 'light'
}

/** The document carries the scheme as a class and as `data-theme`; the tokens key off both. */
function applyThemeToDocument(resolved: 'light' | 'dark'): void {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
  root.setAttribute('data-theme', resolved)
}

export function useNolaTheme(): NolaThemeController {
  const persisted = useStore(settingsStore, state => state.settings?.theme)
  const [local, setLocal] = useState<NolaThemePreference>(readStoredTheme)
  const [system, setSystem] = useState<'light' | 'dark'>(systemTheme)
  const preference: NolaThemePreference = persisted ?? local

  useEffect(() => {
    const media = window.matchMedia?.(DARK_SCHEME_QUERY)
    if (!media) return
    const update = (): void => setSystem(media.matches ? 'dark' : 'light')
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // A preference that arrives from the main process wins over the local copy.
  useEffect(() => {
    if (persisted && persisted !== local) {
      setLocal(persisted)
      storeTheme(persisted)
    }
  }, [persisted, local])

  const resolved = local === 'system' ? system : local

  useLayoutEffect(() => {
    applyThemeToDocument(resolved)
  }, [resolved])

  const setTheme = useCallback((next: NolaThemePreference) => {
    setLocal(next)
    storeTheme(next)
    void updateSettings({ theme: next }).catch(() => {
      setLocal(preference)
      storeTheme(preference)
    })
  }, [preference])
  return { theme: preference, resolved, setTheme }
}
function isPreference(value: string): value is NolaThemePreference { return value === 'system' || value === 'light' || value === 'dark' }
