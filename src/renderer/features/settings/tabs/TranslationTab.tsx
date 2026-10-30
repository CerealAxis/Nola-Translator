/** Translation behavior stays here; model and connection configuration lives in Model Management. */

import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { SliderRoot, SliderControl, SliderTrack, SliderIndicator, SliderThumb } from '@/components/ui/slider'
import type { CredentialProvider } from '@/bridge'
import { SettingsRow } from '../SettingsRow'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { actions, updateSettings } from '@/store'
import { SettingGroup, SettingSwitch } from '../SettingsPage'
import type { SettingsPanelProps } from '../SettingsPage'

export function TranslationTab({ settings }: SettingsPanelProps) {
  const { t } = useI18n()
  const translation = settings.translation

  return (
    <div className="settings-panel" data-onboarding="translation-settings">
      <SettingGroup onboardingTarget="translation-service" legend={t('settings.groupProvider')}>
        <SettingsRow label={t('settings.translateIntermediate')} desc={t('settings.translateIntermediateHint')} descriptionTooltip>
          <SettingSwitch isSelected={translation.translateIntermediate} ariaLabel={t('settings.translateIntermediate')}
            onChange={next => { void updateSettings({ translation: { translateIntermediate: next } }).catch(() => undefined) }} />
        </SettingsRow>
        {translation.translateIntermediate ? <SettingsRow label={t('settings.intermediateTranslationInterval')} desc={t('settings.intermediateTranslationIntervalHint')} descriptionTooltip>
          <div className="flex w-full max-w-64 items-center gap-3">
            <SliderRoot className="slider min-w-0 flex-1" min={0} max={2000} step={100} value={translation.intermediateTranslationIntervalMs} onValueChange={value => {
              if (typeof value === 'number') void updateSettings({ translation: { intermediateTranslationIntervalMs: value } }).catch(() => undefined)
            }}>
              <SliderControl><SliderTrack><SliderIndicator /><SliderThumb aria-label={t('settings.intermediateTranslationInterval')} /></SliderTrack></SliderControl>
            </SliderRoot>
            <span className="min-w-12 text-end tabular-nums">{(translation.intermediateTranslationIntervalMs / 1000).toFixed(1)}s</span>
          </div>
        </SettingsRow> : null}
      </SettingGroup>
    </div>
  )
}

/** Label above, input below; the placeholder only shows the expected format. */
export interface TextRowProps {
  label: string
  desc?: ReactNode
  placeholder?: string
  descriptionTooltip?: boolean
  value: string
  onCommit: (value: string) => void
}

export function TextRow({
  label,
  desc,
  placeholder,
  descriptionTooltip,
  value,
  onCommit,
}: TextRowProps) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)

  // Follow an external change (another window edited the settings) unless this row is being
  // edited, so a keystroke in progress is not overwritten.
  const shown = focused ? draft : value
  const commit = useCallback(() => {
    setFocused(false)
    if (draft !== value) onCommit(draft)
  }, [draft, value, onCommit])

  return (
    <SettingsRow label={label} desc={desc} descriptionTooltip>
      <Input
        aria-label={label}
        value={shown}
        onValueChange={setDraft}
        onFocus={() => { setDraft(value); setFocused(true) }}
        onBlur={commit}
        className="settings-control-field"
        placeholder={placeholder}
      />
    </SettingsRow>
  )
}

/**
 * Number row (context window, max output tokens). The value is a **string draft** parsed on
 * blur, because that is the only way to replace `128` with `128000` by clearing first: writing
 * on every keystroke would persist the intermediate `1`.
 *
 * An unparsable draft is discarded and the previous value kept, never writing NaN — the engine
 * would only report "invalid configuration" without naming the field. The lower bound only
 * rejects an obviously impossible 0 or negative; the right size is the user's call.
 */
export interface NumberRowProps { label: string; value: number; onCommit: (value: number) => void }

export function NumberRow({
  label,
  value,
  onCommit,
}: NumberRowProps) {
  const [draft, setDraft] = useState(String(value))
  const [focused, setFocused] = useState(false)

  const shown = focused ? draft : String(value)
  const commit = useCallback(() => {
    setFocused(false)
    const next = Number(draft.trim())
    if (!Number.isFinite(next) || next <= 0) return
    const rounded = Math.round(next)
    if (rounded !== value) onCommit(rounded)
  }, [draft, value, onCommit])

  return (
    <SettingsRow label={label}>
      <Input
        type="number"
        min={1}
        step={1}
        value={shown}
        onValueChange={setDraft}
        onFocus={() => { setDraft(String(value)); setFocused(true) }}
        onBlur={commit}
        className="settings-control-field"
        aria-label={label}
      />
    </SettingsRow>
  )
}

export interface ApiKeyRowProps { provider: CredentialProvider; stored: boolean }

export function ApiKeyRow({ provider, stored }: ApiKeyRowProps) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [state, setState] = useState<'idle' | 'pending'>('idle')
  const saveTask = useRef<Promise<boolean> | null>(null)
  const masked = stored && !editing && draft === ''

  const save = useCallback((nextDraft: string): Promise<boolean> => {
    if (saveTask.current) return saveTask.current
    const key = nextDraft.trim()
    if (key === '') return Promise.resolve(true)
    setState('pending')
    const task = actions.models.setTranslationCredential(provider, key)
      .then(() => {
        setDraft('')
        notifySuccess(t('common.saved'))
        return true
      })
      .catch((cause: unknown) => {
        notifyError(t('settings.translationCredentialSaveFailed'), { cause })
        return false
      })
      .finally(() => {
        saveTask.current = null
        setState('idle')
      })
    saveTask.current = task
    return task
  }, [provider, t])

  return (
    <SettingsRow label={t('settings.apiKey')} desc={t('settings.apiKeyHint')} descriptionTooltip>
      <Input
        aria-label={t('settings.apiKey')}
        value={masked ? `sk-${'*'.repeat(80)}` : draft}
        onValueChange={setDraft}
        onFocus={() => setEditing(true)}
        onBlur={() => { setEditing(false); void save(draft) }}
        type={masked ? 'text' : 'password'}
        readOnly={masked}
        className="settings-control-field"
        placeholder={stored ? '' : t('settings.apiKeyPlaceholder')}
        disabled={state === 'pending'}
      />
    </SettingsRow>
  )
}
