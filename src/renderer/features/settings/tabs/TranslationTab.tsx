/** Translation behavior stays here; model and connection configuration lives in Model Management. */

import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { CredentialProvider } from '@/bridge'
import { SettingsRow } from '../SettingsRow'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { actions, updateSettings } from '@/store'
import { useRoute } from '@/routes'
import { SettingGroup, SettingSwitch } from '../SettingsPage'
import type { SettingsPanelProps } from '../SettingsPage'
import { supportsIntermediateTranslation } from '../../../../shared/cloud-config'

export function TranslationTab({ settings }: SettingsPanelProps) {
  const { t } = useI18n()
  const { navigate } = useRoute()
  const translation = settings.translation

  return (
    <div className="settings-panel" data-onboarding="translation-settings">
      <SettingGroup onboardingTarget="translation-service" legend={t('settings.groupProvider')}>
        {translation.targetLanguage !== 'none' && supportsIntermediateTranslation(translation.provider) ? <SettingsRow label={t('settings.translateIntermediate')} desc={t('settings.translateIntermediateHint')} descriptionTooltip>
          <SettingSwitch isSelected={translation.translateIntermediate} ariaLabel={t('settings.translateIntermediate')}
            onChange={next => { void updateSettings({ translation: { translateIntermediate: next } }).catch(() => undefined) }} />
        </SettingsRow> : null}
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => navigate('#/models')}>{t('modelsPolicy.title')}</Button>
          <Tooltip>
            <TooltipTrigger render={<Button variant="secondary" size="icon-xs" className="min-h-6 border-transparent bg-transparent text-muted hover:bg-surface-secondary" aria-label={t('modelsPolicy.defaultHint')} />}>
              <CircleHelp aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent side="top" className="z-popup max-w-96 whitespace-normal">{t('modelsPolicy.defaultHint')}</TooltipContent>
          </Tooltip>
        </div>
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
      .catch(() => {
        notifyError(t('errors.translateFailed'))
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
