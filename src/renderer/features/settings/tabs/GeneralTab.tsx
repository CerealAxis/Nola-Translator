import { SettingsRow } from '../SettingsRow'
/**
 * 常规。主题、减少动效、界面语言。
 *
 * **主题只走 `useNolaTheme()`。** 不直接调 HeroUI 的 `useTheme()`：那是一个独立状态源
 * （自己的 useState + 自己的 localStorage key），标题栏切了这里还显示旧值，两处对不上。
 * `useNolaTheme` 内部已经是"先改 DOM、再 `updateSettings({theme})`、失败回退"，
 * 见 primitives/TitleBar。
 *
 * **减少动效没有 AppSettings 字段。** 引擎设置结构里只有 theme / uiLanguage /
 * recognition / overlay / translation。它先落在 localStorage，并直接写
 * `html[data-reduce-motion]`，因为 reduce-motion.css 的应用内通道读的就是这个属性。
 */

import { useCallback, useEffect } from 'react'
import { ToggleButton, ToggleButtonGroup } from '@heroui/react'

import { useNolaTheme } from '@/components/primitives'
import { useI18n } from '@/i18n'
import type { UiLanguage } from '@/i18n'
import { updateSettings } from '@/store'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'
import type { PickerOption, SettingsPanelProps } from '../SettingsPage'

export function GeneralTab({ settings }: SettingsPanelProps) {
  const { t, language, setLanguage } = useI18n()
  /*
   * `settings.appearance.reduceMotion` **已经是设置结构里的一等字段**
   * （`src/shared/settings.ts` 的 `AppearancePrefs`，主进程 zod schema 也收）。
   * 它曾经只能存 localStorage —— 那不算持久化：换台机器或清一次缓存就没了，
   * 而「减少动效」恰恰是对无障碍有影响的一项。字段补齐后已改走 updateSettings，
   * 别再按「tier: ipc-new 槽位」处理它。
   */
  const reduceMotion = settings.appearance?.reduceMotion ?? false

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = reduceMotion ? 'true' : 'false'
  }, [reduceMotion])

  const onReduceMotion = useCallback((next: boolean) => {
    void updateSettings({ appearance: { reduceMotion: next } }).catch(() => undefined)
  }, [])

  /*
   * **只有两个选项，没有「跟随系统」。** `AppSettings.uiLanguage` 的并集就是
   * `'zh-CN' | 'en'`，主进程的 zod schema 是 `z.enum(['zh-CN','en'])`；写第三个值
   * 会被 `updateSettings` 拒收，而原型那版正是靠 localStorage 兜住这个多出来的档位的
   * —— 现在语言只从主进程来，localStorage 不再参与，这个洞就没了。
   */
  const languageOptions: PickerOption[] = [
    { value: 'zh-CN', label: t('language.zhCN') },
    { value: 'en', label: t('language.en') },
  ]

  return (
    <div className="settings-panel">
      <SettingGroup legend={t('settings.groupAppearance')}>
        <ThemeRow />
        <SettingsRow label={t('settings.reduceMotion')}>
          <SettingSwitch
            isSelected={reduceMotion}
            ariaLabel={t('settings.reduceMotion')}
            onChange={onReduceMotion}
          />
        </SettingsRow>
      </SettingGroup>

      <SettingGroup legend={t('settings.groupLanguage')}>
        <SettingsRow label={t('settings.uiLanguage')}>
          <SettingSelect
            value={language}
            options={languageOptions}
            ariaLabel={t('settings.uiLanguage')}
            onChange={(next) => {
              /*
               * `setLanguage()` 自己就会乐观更新界面并在写失败时回滚，它内部调的是
               * `updateSettings({ uiLanguage })`。这里**不要**再调一次 ——
               * 两次写会排队，第二次的失败回滚会把第一次的成功结果一起抹掉
               * （"我刚改的语言自己弹回去了"）。
               */
              void setLanguage(next as UiLanguage).catch(() => undefined)
            }}
          />
        </SettingsRow>
      </SettingGroup>
    </div>
  )
}

function ThemeRow() {
  const { t } = useI18n()
  const { theme, setTheme } = useNolaTheme()

  const options = [
    { id: 'light', label: t('titleBar.themeLight') },
    { id: 'dark', label: t('titleBar.themeDark') },
    { id: 'system', label: t('titleBar.themeSystem') },
  ] as const

  return (
    <SettingsRow label={t('settings.theme')}>
      <ToggleButtonGroup
        className="nola-segmented"
        selectionMode="single"
        disallowEmptySelection
        aria-label={t('settings.theme')}
        selectedKeys={new Set([theme])}
        onSelectionChange={(keys) => {
          const next = [...keys][0]
          if (typeof next === 'string') setTheme(next as 'system' | 'light' | 'dark')
        }}
        size="sm"
      >
        {options.map((option) => (
          <ToggleButton key={option.id} id={option.id}>
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </SettingsRow>
  )
}

