import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Fieldset } from '@base-ui/react/fieldset'
import { LoaderCircle } from 'lucide-react'

import type { AppSettings } from '@/bridge'
import { Button } from '@/components/ui/button'
import { Switch, SwitchThumb } from '@/components/ui'
import { Card, CardContent } from '@/components/ui/card'
import { FieldGroup } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/i18n'
import { DEFAULT_SETTINGS_TAB, useRoute } from '@/routes'
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
import { SETTINGS_NAVIGATION } from './settingsNavigation'

export interface SettingsPanelProps { settings: AppSettings }

export function SettingsPage() {
  const { t } = useI18n()
  const { tab, path, glossaryLibraryId } = useRoute()
  const settings = useStore(stores.settings, (state) => state.settings)
  const loadError = useStore(stores.settings, (state) => state.loadError)
  const error = useStore(stores.settings, (state) => state.error)
  const active = tab ?? DEFAULT_SETTINGS_TAB
  const page = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const scroller = page.current?.closest('.nola-main')
    if (scroller) scroller.scrollTop = 0
  }, [path])

  useEffect(() => { if (loadError) console.error('[settings.load]', loadError) }, [loadError])
  useEffect(() => { if (error) console.error('[settings]', error) }, [error])

  const panels = settings ? {
    general: <GeneralTab settings={settings} />,
    shortcuts: <ShortcutsTab settings={settings} />,
    audio: <AudioTab settings={settings} />,
    engine: <div className="settings-panel">
      <ComputeTab settings={settings} />
      <PerformanceTab settings={settings} />
      <EngineDiagnostics />
    </div>,
    appearance: <AppearanceTab settings={settings} />,
    storage: <StorageTab settings={settings} />,
    glossary: <GlossaryTab libraryId={glossaryLibraryId} />,
    help: <MoreTab />,
    browser: <BrowserTab />,
    developer: import.meta.env.DEV ? <DeveloperTab /> : null,
  } : null

  return (
    <section className="settings-page" ref={page} aria-labelledby="settings-heading">
      <h1 id="settings-heading" className="settings-page__heading">{t(SETTINGS_NAVIGATION[active].label)}</h1>
      <div className="settings-panels">
        {panels ? panels[active] : loadError ? (
          <Card size="sm">
            <CardContent className="flex flex-col items-start gap-3">
              <p className="nola-body-strong">{t('settings.loadFailed')}</p>
              <Button variant="secondary" size="sm" onClick={() => void actions.settings.loadSettings().catch(() => undefined)}>{t('models.retry')}</Button>
            </CardContent>
          </Card>
        ) : isEngineConnected() ? (
          <Card size="sm">
            <CardContent className="flex items-center gap-2" role="status">
              <LoaderCircle className="animate-spin" aria-hidden="true" size={16} />
              <p>{t('common.loading')}</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  )
}

export interface SettingGroupProps { legend: string; legendHint?: ReactNode; actions?: ReactNode; children: ReactNode; onboardingTarget?: string; id?: string }

export function SettingGroup({ legend, legendHint, actions, children, onboardingTarget, id }: SettingGroupProps) {
  const headingId = useId()
  return (
    <section id={id} className="settings-group" data-onboarding={onboardingTarget}>
      <div className="settings-group__heading">
        <h2 id={headingId}>{legend}</h2>
        {legendHint ? <span className="settings-group__hint">{legendHint}</span> : null}
      </div>
      <Fieldset.Root className="settings-group__fields" aria-labelledby={headingId}>
        <FieldGroup className="gap-0">{children}</FieldGroup>
        {actions ? <div className="settings-group__actions">{actions}</div> : null}
      </Fieldset.Root>
    </section>
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
