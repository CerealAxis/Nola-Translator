import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Card, Fieldset, ListBox, Spinner, Switch, Tabs } from '@heroui/react'
import { Cpu, Gauge, Database, Languages, Mic, Monitor, Settings, SlidersHorizontal } from 'lucide-react'

import type { AppSettings } from '@/bridge'
import { useI18n } from '@/i18n'
import { DEFAULT_SETTINGS_TAB, SETTINGS_TABS, settingsPath, useRoute } from '@/routes'
import type { SettingsTab } from '@/routes'
import { stores, useStore } from '@/store'
import { SelectField } from './index'
import { GeneralTab } from './tabs/GeneralTab'
import { AudioTab } from './tabs/AudioTab'
import { TranslationTab } from './tabs/TranslationTab'
import { AppearanceTab } from './tabs/AppearanceTab'
import { StorageTab } from './tabs/StorageTab'
import { AdvancedTab } from './tabs/AdvancedTab'
import { ComputeTab } from './tabs/ComputeTab'
import { PerformanceTab } from './tabs/PerformanceTab'
import { BrowserTab } from './tabs/BrowserTab'
import './settings.css'

export interface SettingsPanelProps { settings: AppSettings }

const NAV_ICONS = { browser: Monitor, general: Settings, audio: Mic, translation: Languages, compute: Cpu, performance: Gauge, appearance: Monitor, storage: Database, advanced: SlidersHorizontal }

export function SettingsPage() {
  const { t, language } = useI18n()
  const { tab, navigate } = useRoute()
  const settings = useStore(stores.settings, (state) => state.settings)
  const error = useStore(stores.settings, (state) => state.error)
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width:850px)').matches)
  const active: SettingsTab = SETTINGS_TABS.find((item) => item === tab) ?? DEFAULT_SETTINGS_TAB

  useEffect(() => {
    const media = window.matchMedia('(max-width:850px)')
    const update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => { if (error) console.error('[settings]', error) }, [error])

  if (!settings) return (
    <Card className="settings-group">
      <Card.Content className="flex items-center gap-2"><Spinner size="sm" /><p>{t('common.loading')}</p></Card.Content>
    </Card>
  )

  const labels: Record<SettingsTab, string> = {
    browser: t('browser.title'),
    compute: language === 'en' ? 'Compute devices' : '计算设备',
    performance: language === 'en' ? 'Performance & memory' : '性能与显存',
    general: t('modelsSettingsUi.general'), audio: t('modelsSettingsUi.audio'),
    translation: t('modelsSettingsUi.translation'), appearance: t('modelsSettingsUi.appearance'),
    storage: t('modelsSettingsUi.storage'), advanced: t('modelsSettingsUi.advanced'),
  }

  return (
    <div className="settings-page">
      <header className="settings-page__heading"><h1>{t('settings.title')}</h1><p>{t('modelsSettingsUi.settingsSubtitle')}</p></header>
      {error ? <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>{t('errors.storageChanged')}</Alert.Title><Alert.Description>{t('errors.storageChangedAction')}</Alert.Description></Alert.Content></Alert> : null}
      <Tabs orientation={compact ? 'horizontal' : 'vertical'} align="start" selectedKey={active}
        onSelectionChange={(key) => navigate(settingsPath(String(key) as SettingsTab))} className="settings-tabs">
        <div className="settings-nav">
          <Tabs.List aria-label={t('modelsSettingsUi.settingsTabs')}>
            {SETTINGS_TABS.map((item) => {
              const Icon = NAV_ICONS[item]
              return <Tabs.Tab key={item} id={item}><Icon aria-hidden="true" />{labels[item]}<Tabs.Indicator /></Tabs.Tab>
            })}
          </Tabs.List>
        </div>
        <div className="settings-panels">
          <Tabs.Panel id="general"><GeneralTab settings={settings} /></Tabs.Panel>
          <Tabs.Panel id="audio"><AudioTab settings={settings} /></Tabs.Panel>
          <Tabs.Panel id="translation"><TranslationTab settings={settings} /></Tabs.Panel>
          <Tabs.Panel id="compute"><ComputeTab settings={settings} /></Tabs.Panel>
          <Tabs.Panel id="performance"><PerformanceTab settings={settings} /></Tabs.Panel>
          <Tabs.Panel id="appearance"><AppearanceTab settings={settings} /></Tabs.Panel>
          <Tabs.Panel id="storage"><StorageTab settings={settings} /></Tabs.Panel>
          <Tabs.Panel id="advanced"><AdvancedTab settings={settings} /></Tabs.Panel>
          <Tabs.Panel id="browser"><BrowserTab /></Tabs.Panel>
        </div>
      </Tabs>
    </div>
  )
}

export interface SettingGroupProps { legend: string; actions?: ReactNode; children: ReactNode }

export function SettingGroup({ legend, actions, children }: SettingGroupProps) {
  return (
    <Card className="settings-group">
      <Card.Header><Card.Title>{legend}</Card.Title></Card.Header>
      <Card.Content><Fieldset aria-label={legend}><div className="settings-group__rows">{children}</div></Fieldset></Card.Content>
      {actions ? <Card.Footer className="flex justify-end gap-2">{actions}</Card.Footer> : null}
    </Card>
  )
}

export interface PickerOption { value: string; label: string; isDisabled?: boolean }
export interface SettingSelectProps { value: string; options: readonly PickerOption[]; onChange: (value: string) => void; ariaLabel: string; className?: string; isDisabled?: boolean }

export function SettingSelect({ value, options, onChange, ariaLabel, className, isDisabled }: SettingSelectProps) {
  return (
    <SelectField value={value} onChange={(key) => { if (typeof key === 'string') onChange(key) }} aria-label={ariaLabel} className={className} isDisabled={isDisabled}>
      <SelectField.Trigger><SelectField.Value /><SelectField.Indicator /></SelectField.Trigger>
      <SelectField.Popover><ListBox>
        {options.map((option) => <ListBox.Item key={option.value} id={option.value} textValue={option.label} isDisabled={option.isDisabled}>{option.label}<ListBox.ItemIndicator /></ListBox.Item>)}
      </ListBox></SelectField.Popover>
    </SelectField>
  )
}

export interface SettingSwitchProps { isSelected: boolean; onChange: (next: boolean) => void; ariaLabel: string }
export function SettingSwitch({ isSelected, onChange, ariaLabel }: SettingSwitchProps) {
  return (
    <Switch isSelected={isSelected} onChange={onChange} aria-label={ariaLabel}>
      <Switch.Content aria-label={ariaLabel}>
        <Switch.Control><Switch.Thumb /></Switch.Control>
      </Switch.Content>
    </Switch>
  )
}
