import { SettingsRow } from '../SettingsRow'
/**
 * General: theme, reduced motion, UI language, network.
 *
 * The theme goes through `useNolaTheme()` so this tab and the title bar share one controller:
 * it applies the theme first and persists it with `updateSettings({ theme })`, rolling back to
 * the previous theme if the write fails.
 *
 * Reduced motion is a first-class `appearance.reduceMotion` setting. `theme/motion.css` is the
 * in-app channel and keys off `html[data-reduce-motion]`, which is why the toggle writes that
 * attribute as well as persisting the flag.
 */

import { useCallback, useEffect, useState } from 'react'
import { Input, TextField, ToggleButton, ToggleButtonGroup } from '@heroui/react'

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

      <NetworkGroup settings={settings} />
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

/**
 * Mirror sources and proxying for every outbound download.
 *
 * The three proxy switches stay disabled while the address is empty: a switch reading "on" while
 * every download path still ignores the proxy is the most misleading state this group could show.
 */
function NetworkGroup({ settings }: SettingsPanelProps) {
  const { t } = useI18n()
  const network = settings.network
  const proxyConfigured = network.proxyUrl.trim() !== ''

  return (
    <SettingGroup legend={t('settings.groupNetwork')}>
      <NetworkTextRow
        label={t('settings.proxyUrl')}
        desc={t('settings.proxyUrlHint')}
        value={network.proxyUrl}
        onCommit={(proxyUrl) => {
          void updateSettings({ network: { proxyUrl } }).catch(() => undefined)
        }}
      />
      <SettingsRow label={t('settings.proxyForPip')}>
        <SettingSwitch
          isSelected={network.proxyForPip}
          isDisabled={!proxyConfigured}
          ariaLabel={t('settings.proxyForPip')}
          onChange={(proxyForPip) => {
            void updateSettings({ network: { proxyForPip } }).catch(() => undefined)
          }}
        />
      </SettingsRow>
      <SettingsRow label={t('settings.proxyForModelDownload')}>
        <SettingSwitch
          isSelected={network.proxyForModelDownload}
          isDisabled={!proxyConfigured}
          ariaLabel={t('settings.proxyForModelDownload')}
          onChange={(proxyForModelDownload) => {
            void updateSettings({ network: { proxyForModelDownload } }).catch(() => undefined)
          }}
        />
      </SettingsRow>
      <SettingsRow label={t('settings.proxyForRuntimeDownload')}>
        <SettingSwitch
          isSelected={network.proxyForRuntimeDownload}
          isDisabled={!proxyConfigured}
          ariaLabel={t('settings.proxyForRuntimeDownload')}
          onChange={(proxyForRuntimeDownload) => {
            void updateSettings({ network: { proxyForRuntimeDownload } }).catch(() => undefined)
          }}
        />
      </SettingsRow>
      <SettingsRow label={t('settings.pypiMirror')} desc={t('settings.pypiMirrorHint')} descriptionTooltip>
        <SettingSwitch
          isSelected={network.usePypiMirror}
          ariaLabel={t('settings.pypiMirror')}
          onChange={(usePypiMirror) => {
            void updateSettings({ network: { usePypiMirror } }).catch(() => undefined)
          }}
        />
      </SettingsRow>
      <SettingsRow label={t('settings.huggingFaceMirror')} desc={t('settings.huggingFaceMirrorHint')} descriptionTooltip>
        <SettingSwitch
          isSelected={network.useHuggingFaceMirror}
          ariaLabel={t('settings.huggingFaceMirror')}
          onChange={(useHuggingFaceMirror) => {
            void updateSettings({ network: { useHuggingFaceMirror } }).catch(() => undefined)
          }}
        />
      </SettingsRow>
      <NetworkTextRow
        label={t('settings.githubAccelerate')}
        desc={t('settings.githubAccelerateHint')}
        value={network.githubAccelerateUrl}
        onCommit={(githubAccelerateUrl) => {
          void updateSettings({ network: { githubAccelerateUrl } }).catch(() => undefined)
        }}
      />
    </SettingGroup>
  )
}

/**
 * The stored value wins again once the field is left, so an edit from another window cannot cut a
 * keystroke in half; the draft is only read while this field owns the focus.
 */
function NetworkTextRow({ label, desc, value, onCommit }: {
  label: string
  desc: string
  value: string
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const shown = focused ? draft : value
  const commit = useCallback(() => {
    setFocused(false)
    if (draft !== value) onCommit(draft)
  }, [draft, value, onCommit])

  return (
    <SettingsRow label={label} desc={desc} descriptionTooltip>
      <TextField
        value={shown}
        onChange={setDraft}
        onFocus={() => { setDraft(value); setFocused(true) }}
        onBlur={commit}
        className="w-[200px]"
      >
        <Input className="rounded-[8px]" aria-label={label} />
      </TextField>
    </SettingsRow>
  )
}
