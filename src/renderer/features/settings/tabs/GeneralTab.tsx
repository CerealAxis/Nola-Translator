import { SettingsRow } from '../SettingsRow'
/**
 * General: theme, reduced motion, UI language.
 *
 * The theme goes through `useNolaTheme()` so this tab and the title bar share one controller:
 * it applies the theme first and persists it with `updateSettings({ theme })`, rolling back to
 * the previous theme if the write fails.
 *
 * Reduced motion is a first-class `appearance.reduceMotion` setting. `theme/motion.css` is the
 * in-app channel and keys off `html[data-reduce-motion]`, which is why the toggle writes that
 * attribute as well as persisting the flag.
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
  const reduceMotion = settings.appearance?.reduceMotion ?? false

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = reduceMotion ? 'true' : 'false'
  }, [reduceMotion])

  const onReduceMotion = useCallback((next: boolean) => {
    void updateSettings({ appearance: { reduceMotion: next } }).catch(() => undefined)
  }, [])

  // Only two options, and no "follow the system": `uiLanguage` is a main-process zod enum of
  // exactly these, and the store coerces anything else to `zh-CN`.
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
              // `setLanguage` already updates optimistically and rolls back a failed write,
              // so calling `updateSettings` here too would let the second rollback undo the
              // first write's success.
              void setLanguage(next as UiLanguage).catch(() => undefined)
            }}
          />
        </SettingsRow>
      </SettingGroup>

      <SettingGroup legend={t('settings.groupDownloads')}>
        <SettingsRow label={t('settings.huggingFaceMirror')} desc={t('settings.huggingFaceMirrorHint')} descriptionTooltip>
          <SettingSwitch
            isSelected={settings.useHuggingFaceMirror}
            ariaLabel={t('settings.huggingFaceMirror')}
            onChange={(useHuggingFaceMirror) => {
              void updateSettings({ useHuggingFaceMirror }).catch(() => undefined)
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
