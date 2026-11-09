import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Fieldset } from '@base-ui/react/fieldset'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Captions, Cpu, CircleHelp, FolderOpen, FlaskConical, Keyboard, AudioLines, PanelsTopLeft, SlidersHorizontal, LoaderCircle, BookOpen } from 'lucide-react'

import type { AppSettings } from '@/bridge'
import { Button } from '@/components/ui/button'
import { Switch, SwitchThumb, TabsContent, TabsList, TabsRoot, TabsTrigger } from '@/components/ui'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/i18n'
import { DEFAULT_SETTINGS_TAB, SETTINGS_TABS, settingsPath, useRoute } from '@/routes'
import type { SettingsTab } from '@/routes'
import { actions, isEngineConnected, stores, useStore } from '@/store'
import { GeneralTab } from './tabs/GeneralTab'
import { AudioTab } from './tabs/AudioTab'
import { AppearanceTab } from './tabs/AppearanceTab'
import { StorageTab } from './tabs/StorageTab'
import { EngineDiagnostics } from './tabs/AdvancedTab'
import { MoreTab } from './tabs/MoreTab'
import { ComputeTab } from './tabs/ComputeTab'
import { PerformanceTab } from './tabs/PerformanceTab'
import { BrowserTab } from './tabs/BrowserTab'
import { DeveloperTab } from './tabs/DeveloperTab'
import { ShortcutsTab } from './tabs/ShortcutsTab'
import { GlossaryTab } from './glossary/GlossaryTab'
import './settings.css'

export interface SettingsPanelProps { settings: AppSettings }

const NAV_ICONS = { general: SlidersHorizontal, audio: AudioLines, appearance: Captions, browser: PanelsTopLeft, shortcuts: Keyboard, engine: Cpu, storage: FolderOpen, glossary: BookOpen, help: CircleHelp, developer: FlaskConical }

/** The nav hint is a Base UI popup, so it carries the same surface tokens as the other tooltips. */
const NAV_TOOLTIP_CLASS = 'settings-nav__tooltip z-popup max-w-96 whitespace-normal break-all rounded-nola-ui-xl bg-overlay p-2 text-xs text-overlay-foreground shadow-overlay'

export function SettingsPage() {
  const { t, dictionary } = useI18n()
  const { tab, navigate, glossaryLibraryId } = useRoute()
  const settings = useStore(stores.settings, (state) => state.settings)
  const loadError = useStore(stores.settings, (state) => state.loadError)
  const error = useStore(stores.settings, (state) => state.error)
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width:850px)').matches)
  const active: SettingsTab = SETTINGS_TABS.find((item) => item === tab) ?? DEFAULT_SETTINGS_TAB

  useEffect(() => {
    const media = window.matchMedia('(max-width:850px)')
    const update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => { if (loadError) console.error('[settings.load]', loadError) }, [loadError])
  useEffect(() => { if (error) console.error('[settings]', error) }, [error])

  /*
   * The settings never arrived. The page says so and offers the way out, and the failure
   * itself is a notice: a page-sized alert is a state, not a reminder.
   */
  if (!settings && loadError) return (
    <Card className="settings-group">
      <CardContent className="card__content flex flex-col items-start gap-3">
        <p className="nola-body-strong">{t('settings.loadFailed')}</p>
        <Button variant="secondary" size="sm" onClick={() => void actions.settings.loadSettings().catch(() => undefined)}>{t('models.retry')}</Button>
      </CardContent>
    </Card>
  )

  if (!settings && !isEngineConnected()) return null

  if (!settings) return (
    <Card className="settings-group">
      <CardContent className="card__content flex items-center gap-2"><LoaderCircle className="animate-spin" aria-hidden="true" size={16} /><p>{t('common.loading')}</p></CardContent>
    </Card>
  )

  const labels: Record<SettingsTab, string> = {
    general: t('modelsSettingsUi.general'), audio: t('modelsSettingsUi.audio'),
    appearance: t('modelsSettingsUi.appearance'), browser: t('browser.title'),
    shortcuts: t('modelsSettingsUi.shortcuts'), engine: t('modelsSettingsUi.engine'),
    storage: t('modelsSettingsUi.storage'), help: t('modelsSettingsUi.help'),
    developer: t('dev.tabLabel'),
    glossary: t('suite.glossaryTitle'),
  }
  const NAV_HINTS: Partial<Record<SettingsTab, string>> = { engine: dictionary.compute.nextSession }

  return (
    <div className="settings-page">
      <header className="settings-page__heading"><h1>{t('settings.title')}</h1></header>
      <TabsRoot orientation={compact ? 'horizontal' : 'vertical'} value={active}
        onValueChange={(value) => navigate(settingsPath(String(value) as SettingsTab))} className="settings-tabs">
        <div className="settings-nav">
          <TabsList aria-label={t('modelsSettingsUi.settingsTabs')}>
            {SETTINGS_TABS.map((item) => {
              const Icon = NAV_ICONS[item]
              const hint = NAV_HINTS[item]
              const content = <><Icon aria-hidden="true" />{labels[item]}{hint ? <span className="tabs__hint" aria-hidden="true"><CircleHelp aria-hidden="true" /></span> : null}</>
              return (
                <Tooltip key={item}>
                  <TooltipTrigger delay={300} render={<TabsTrigger value={item} className="tabs__tab" data-selected={active === item ? 'true' : undefined} data-onboarding={`settings-${item}`}>{content}</TabsTrigger>} />
                  {hint ? (
                    <TooltipContent sideOffset={3} className={NAV_TOOLTIP_CLASS}>{hint}</TooltipContent>
                  ) : null}
                </Tooltip>
              )
            })}
          </TabsList>
        </div>
        <div className="settings-panels">
          <TabsContent value="general" className="tabs__panel"><GeneralTab settings={settings} /></TabsContent>
          <TabsContent value="shortcuts" className="tabs__panel"><ShortcutsTab settings={settings} /></TabsContent>
          <TabsContent value="audio" className="tabs__panel"><AudioTab settings={settings} /></TabsContent>
          <TabsContent value="engine" className="tabs__panel"><div className="settings-panel">
            <ComputeTab settings={settings} />
            <PerformanceTab settings={settings} />
            <EngineDiagnostics />
          </div></TabsContent>
          <TabsContent value="appearance" className="tabs__panel"><AppearanceTab settings={settings} /></TabsContent>
          <TabsContent value="storage" className="tabs__panel"><StorageTab settings={settings} /></TabsContent>
          <TabsContent value="glossary" className="tabs__panel"><GlossaryTab libraryId={glossaryLibraryId} /></TabsContent>
          <TabsContent value="help" className="tabs__panel"><MoreTab /></TabsContent>
          <TabsContent value="browser" className="tabs__panel"><BrowserTab /></TabsContent>
          {import.meta.env.DEV ? <TabsContent value="developer" className="tabs__panel"><DeveloperTab /></TabsContent> : null}
        </div>
      </TabsRoot>
    </div>
  )
}

export interface SettingGroupProps { legend: string; legendHint?: ReactNode; actions?: ReactNode; children: ReactNode; onboardingTarget?: string; id?: string }

export function SettingGroup({ legend, legendHint, actions, children, onboardingTarget, id }: SettingGroupProps) {
  return (
    <Card id={id} className="settings-group" data-onboarding={onboardingTarget}>
      <CardHeader className="card__header">
        <CardTitle className={['card__title', legendHint ? 'settings-group__title-with-hint' : undefined].filter(Boolean).join(' ')}>{legend}{legendHint ? <span className="settings-group__hint">{legendHint}</span> : null}</CardTitle>
      </CardHeader>
      <CardContent className="card__content">
        <Fieldset.Root className="fieldset" aria-label={legend}><div className="settings-group__rows">{children}</div></Fieldset.Root>
      </CardContent>
      {actions ? <CardFooter className="justify-end flex-wrap">{actions}</CardFooter> : null}
    </Card>
  )
}

export interface PickerOption { value: string; label: string; isDisabled?: boolean; group?: string }
export interface SettingSelectProps { value: string; options: readonly PickerOption[]; onChange: (value: string) => void; ariaLabel: string; className?: string; isDisabled?: boolean; id?: string }

export function SettingSelect({ value, options, onChange, ariaLabel, className, isDisabled, id }: SettingSelectProps) {
  const groups = new Map<string | undefined, PickerOption[]>()
  for (const option of options) {
    const group = groups.get(option.group)
    if (group) group.push(option)
    else groups.set(option.group, [option])
  }
  /* The wrapper is the field-sized box; the shared shadcn select owns its trigger and popup. */
  return (
    <div className={['select', 'settings-control-field', className].filter(Boolean).join(' ')}>
      <Select value={value} disabled={isDisabled} onValueChange={(next) => { if (typeof next === 'string') onChange(next) }}>
        <SelectTrigger id={id} className="settings-select-trigger" aria-label={ariaLabel}>
          <SelectValue>{(current) => options.find((option) => option.value === current)?.label ?? String(current ?? '')}</SelectValue>
        </SelectTrigger>
        <SelectContent className="settings-select-content" align="start" alignItemWithTrigger={false}>
          {[...groups].map(([group, items]) => <SelectGroup key={group ?? ''}>
            {group ? <SelectLabel>{group}</SelectLabel> : null}
            {items.map(option => <SelectItem key={option.value} value={option.value} disabled={option.isDisabled} className="settings-select-item">{option.label}</SelectItem>)}
          </SelectGroup>)}
        </SelectContent>
      </Select>
    </div>
  )
}

export interface SettingSwitchProps { isSelected: boolean; onChange: (next: boolean) => void; ariaLabel: string; isDisabled?: boolean }
export function SettingSwitch({ isSelected, onChange, ariaLabel, isDisabled }: SettingSwitchProps) {
  /*
   * The root is the switch itself, so the track is a child of it: `switch__control` draws the
   * rail and `switch__thumb` slides inside it, both keyed off the root's `aria-checked`.
   */
  return (
    <Switch checked={isSelected} onCheckedChange={onChange} disabled={isDisabled} aria-label={ariaLabel}>
      <span className="switch__control"><SwitchThumb /></span>
    </Switch>
  )
}
