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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { TabsRoot, TabsList, TabsTrigger } from '@/components/ui'
import { LoaderCircle } from 'lucide-react'

import { useNolaTheme } from '@/components/primitives'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n'
import type { UiLanguagePreference } from '@/i18n'
import { actions, stores, updateSettings, useStore } from '@/store'
import { GITHUB_PROXY_AUTO, GITHUB_PROXY_DEFAULT, GITHUB_PROXY_NODES, GITHUB_PROXY_OFF, findGithubProxyNode } from '../../../../shared/github-proxies'
import { findPypiMirrorNode, findPytorchWheelMirrorNode, PYPI_MIRROR_AUTO, PYPI_MIRROR_NODES, PYPI_MIRROR_OFF, PYTORCH_WHEEL_MIRROR_AUTO, PYTORCH_WHEEL_MIRROR_OFF, PYTORCH_WHEEL_MIRRORS } from '../../../../shared/pypi-mirrors'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'
import type { PickerOption, SettingsPanelProps } from '../SettingsPage'

export function GeneralTab({ settings }: SettingsPanelProps) {
  const { t, uiLanguage, setLanguage } = useI18n()
  const reduceMotion = settings.appearance?.reduceMotion ?? false
  const appUpdateChecking = useStore(stores.settings, (state) => state.appUpdateChecking)

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = reduceMotion ? 'true' : 'false'
  }, [reduceMotion])

  const onReduceMotion = useCallback((next: boolean) => {
    void updateSettings({ appearance: { reduceMotion: next } }).catch(() => undefined)
  }, [])

  const languageOptions: PickerOption[] = [
    { value: 'auto', label: t('language.auto') },
    { value: 'zh-CN', label: t('language.zhCN') },
    { value: 'zh-TW', label: t('language.zhTW') },
    { value: 'zh-HK', label: t('language.zhHK') },
    { value: 'ko', label: t('language.ko') },
    { value: 'ja', label: t('language.ja') },
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
            value={uiLanguage}
            options={languageOptions}
            ariaLabel={t('settings.uiLanguage')}
            onChange={(next) => {
              // `setLanguage` already updates optimistically and rolls back a failed write,
              // so calling `updateSettings` here too would let the second rollback undo the
              // first write's success.
              void setLanguage(next as UiLanguagePreference).catch((error: unknown) => {
                notifyError(t('errors.languageChangeFailed'), { cause: error })
              })
            }}
          />
        </SettingsRow>
      </SettingGroup>

      <SettingGroup legend={t('appUpdate.group')}>
        <SettingsRow label={t('appUpdate.versionCheck')}>
          <Button
            variant="tertiary"
            size="sm"
            disabled={appUpdateChecking}
            onClick={() => {
              void actions.settings.checkForAppUpdate(true).then((result) => {
                if (!result || result.latestVersion === null) {
                  notifyError(t('appUpdate.checkFailed'))
                  return
                }
                notifySuccess(t(result.updateAvailable ? 'appUpdate.availableStatus' : 'appUpdate.upToDateStatus', {
                  version: result.latestVersion,
                }))
              })
            }}
          >
            {appUpdateChecking ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            {t('appUpdate.checkNow')}
          </Button>
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
      <TabsRoot value={theme} onValueChange={next => { if (next) setTheme(next as typeof theme) }}>
        <TabsList className="nola-segmented" aria-label={t('settings.theme')}>
          {options.map(option => <TabsTrigger key={option.id} value={option.id}>{option.label}</TabsTrigger>)}
        </TabsList>
      </TabsRoot>
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

  const nodeOptions = useMemo<PickerOption[]>(() => [
    { value: GITHUB_PROXY_AUTO, label: t('settings.githubAccelerateAuto') },
    { value: GITHUB_PROXY_OFF, label: t('settings.mirrorOff') },
    ...GITHUB_PROXY_NODES.map((node) => ({ value: node, label: githubNodeLabel(node) })),
  ], [t])
  const pypiNodeOptions = useMemo<PickerOption[]>(() => [
    { value: PYPI_MIRROR_AUTO, label: t('settings.pytorchWheelMirrorAuto') },
    { value: PYPI_MIRROR_OFF, label: t('settings.mirrorOff') },
    ...PYPI_MIRROR_NODES.filter(node => node !== PYPI_MIRROR_OFF && node !== PYPI_MIRROR_AUTO).map((node, index) => ({
      value: node,
      label: [t('settings.pypiAliyun'), t('settings.pypiTsinghua'), t('settings.pypiHuawei'), t('settings.pypiTencent')][index] ?? node,
    })),
  ], [t])
  const pytorchWheelOptions = useMemo<PickerOption[]>(() => [
    { value: PYTORCH_WHEEL_MIRROR_AUTO, label: t('settings.pytorchWheelMirrorAuto') },
    { value: PYTORCH_WHEEL_MIRROR_OFF, label: t('settings.mirrorOff') },
    { value: PYTORCH_WHEEL_MIRRORS[0], label: t('settings.pytorchWheelMirrorSjtu') },
    { value: PYTORCH_WHEEL_MIRRORS[1], label: t('settings.pytorchWheelMirrorAliyun') },
  ], [t])
  const huggingFaceOptions = useMemo<PickerOption[]>(() => [
    { value: 'auto', label: t('settings.pytorchWheelMirrorAuto') },
    { value: 'off', label: t('settings.mirrorOff') },
  ], [t])

  return (
    <SettingGroup onboardingTarget="network-settings" legend={t('settings.groupNetwork')}>
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
        <SettingSelect
          value={findPypiMirrorNode(network.pypiMirrorUrl) ?? PYPI_MIRROR_AUTO}
          options={pypiNodeOptions}
          ariaLabel={t('settings.pypiMirror')}
          onChange={(pypiMirrorUrl) => {
            void updateSettings({ network: { pypiMirrorUrl, usePypiMirror: pypiMirrorUrl !== PYPI_MIRROR_OFF } }).catch(() => undefined)
          }}
        />
      </SettingsRow>
      <SettingsRow label={t('settings.pytorchWheelMirrorNode')} desc={t('settings.pytorchWheelMirrorHint')} descriptionTooltip>
        <SettingSelect
          value={findPytorchWheelMirrorNode(network.pytorchWheelMirrorUrl) ?? PYTORCH_WHEEL_MIRROR_AUTO}
          options={pytorchWheelOptions}
          ariaLabel={t('settings.pytorchWheelMirrorNode')}
          onChange={(pytorchWheelMirrorUrl) => {
            void updateSettings({ network: { pytorchWheelMirrorUrl } }).catch(() => undefined)
          }}
        />
      </SettingsRow>
      <SettingsRow label={t('settings.huggingFaceMirror')} desc={t('settings.huggingFaceMirrorHint')} descriptionTooltip>
        <SettingSelect
          value={network.useHuggingFaceMirror ? 'auto' : 'off'}
          options={huggingFaceOptions}
          ariaLabel={t('settings.huggingFaceMirror')}
          onChange={(value) => {
            void updateSettings({ network: { useHuggingFaceMirror: value === 'auto' } }).catch(() => undefined)
          }}
        />
      </SettingsRow>
      <SettingsRow label={t('settings.githubAccelerate')} desc={t('settings.githubAccelerateHint')} descriptionTooltip>
        <SettingSelect
          value={!network.useGithubAccelerate || network.githubAccelerateUrl === GITHUB_PROXY_OFF
            ? GITHUB_PROXY_OFF
            : network.githubAccelerateUrl === GITHUB_PROXY_AUTO
            ? GITHUB_PROXY_AUTO
            : findGithubProxyNode(network.githubAccelerateUrl) ?? GITHUB_PROXY_DEFAULT}
          options={nodeOptions}
          ariaLabel={t('settings.githubAccelerate')}
          onChange={(githubAccelerateUrl) => {
            void updateSettings({ network: { githubAccelerateUrl, useGithubAccelerate: githubAccelerateUrl !== GITHUB_PROXY_OFF } }).catch(() => undefined)
          }}
        />
      </SettingsRow>
    </SettingGroup>
  )
}

/**
 * A node is stored as the URL that gets concatenated onto an asset URL, but 115 rows sharing one
 * `https://` prefix are unreadable, so the picker shows the host alone. An entry the strip cannot
 * reduce falls back to the full URL, which is still a row the user can pick from and recognise.
 */
function githubNodeLabel(node: string): string {
  return node.replace(/^https?:\/\//, '').replace(/\/+$/, '') || node
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
      <Input
        value={shown}
        onValueChange={setDraft}
        onFocus={() => { setDraft(value); setFocused(true) }}
        onBlur={commit}
        className="settings-control-field"
        aria-label={label}
      />
    </SettingsRow>
  )
}
