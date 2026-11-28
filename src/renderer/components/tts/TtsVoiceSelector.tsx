import { useEffect, useMemo, useRef, useState } from 'react'
import { getBridge } from '@/store'
import { useI18n } from '@/i18n'
import { ttsText } from '@/i18n/tts-ui'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { notifyError } from '@/components/primitives/notify'
import { ttsCompatibilityReason } from './tts-error-copy'
import { voiceRefKey, type TtsVoiceRef } from '../../../shared/tts/voice-ref'
import type { TtsVoiceProfile } from '../../../shared/tts/voice-profile'
import type { TtsUsage, TtsVoiceCompatibility } from '../../../shared/tts/voice-library-api'
import { useTtsCapabilities } from './use-tts-capabilities'
import { useVoiceCompatibility } from './use-voice-compatibility'

export function TtsVoiceSelector({ modelBinding, targetLanguage, targetLanguages, usage = 'synthesis', value, onChange, disabled, id, profilesOnly = false, sessionSpeakers = [] }: {
  modelBinding: string; targetLanguage: string; targetLanguages?: string[]; usage?: TtsUsage;
  value: TtsVoiceRef; onChange: (ref: TtsVoiceRef) => void;
  disabled?: boolean; id?: string; profilesOnly?: boolean;
  sessionSpeakers?: Array<{ name: string; voiceRef: Extract<TtsVoiceRef, { kind: 'session-speaker' }> }>;
}) {
  const { language } = useI18n()
  const text = (key: Parameters<typeof ttsText>[1]) => ttsText(language, key)
  const { capabilities, error } = useTtsCapabilities(modelBinding)
  const [profiles, setProfiles] = useState<TtsVoiceProfile[]>([])
  const [open, setOpen] = useState(false)
  const [refreshRevision, setRefreshRevision] = useState(0)
  const inventoryFailure = useRef(false)
  const [profilesLoaded, setProfilesLoaded] = useState(false)
  const languages = targetLanguages ?? [targetLanguage]
  useEffect(() => {
    let active = true
    void getBridge()?.voices?.list().then(items => { if (active) { setProfiles(items); setProfilesLoaded(true); inventoryFailure.current = false } })
      .catch(cause => { if (active && !inventoryFailure.current) { inventoryFailure.current = true; notifyError(text('inventoryFailed'), { cause }) } })
    return () => { active = false }
  }, [modelBinding, refreshRevision])
  useEffect(() => { if (error) notifyError(text('inventoryFailed'), { cause: error }) }, [error])
  const options = useMemo(() => {
    const items: Array<{ ref: TtsVoiceRef; name: string }> = profilesOnly ? [] : [{ ref: { kind: 'engine-default' }, name: text('defaultVoice') }]
    for (const speaker of sessionSpeakers) items.push({ ref: speaker.voiceRef, name: speaker.name })
    for (const profile of profiles.filter(item => !item.deletedAt)) items.push({
      ref: value.kind === 'profile' && value.profileId === profile.id ? value : { kind: 'profile', profileId: profile.id }, name: profile.name })
    if (!profilesOnly) for (const voice of capabilities?.presetVoices ?? []) items.push({ ref: { kind: 'preset', modelBinding, voiceId: voice.id }, name: voice.name })
    return items
  }, [capabilities, profiles, value, profilesOnly, sessionSpeakers, modelBinding, language])
  const key = voiceRefKey(value)
  const selected = options.find(item => voiceRefKey(item.ref) === key)
  const emptySelection = profilesOnly && value.kind === 'engine-default'
  const missing = value.kind === 'profile' && profilesLoaded && !profiles.some(profile => profile.id === value.profileId && !profile.deletedAt)
  const label = missing ? text('missing') : selected?.name ?? (value.kind === 'preset' ? value.voiceId : text('chooseVoice'))
  const refs = selected || emptySelection ? options.map(item => item.ref) : [...options.map(item => item.ref), value]
  const { results, pending, failed } = useVoiceCompatibility(modelBinding, capabilities ? languages : [], refs,
    JSON.stringify([refreshRevision, profiles.map(profile => [profile.id, profile.revision, profile.deletedAt])]), usage)
  const reason = (item?: TtsVoiceCompatibility) => !languages.length ? text('noOutputDirection')
    : ttsCompatibilityReason(language, item?.code, item?.details, languages[0]) ?? text('incompatible')
  const selectedResult = results.get(key)
  const notice = refreshRevision > 0 && !pending && !failed && capabilities && profilesLoaded && selectedResult && !selectedResult.compatible && value.kind !== 'engine-default'
    ? `${modelBinding}:${key}:${JSON.stringify(languages)}:${reason(selectedResult)}` : ''
  const notified = useRef('')
  useEffect(() => {
    if (notice && notified.current !== notice) { notified.current = notice; notifyError(reason(selectedResult)) }
    if (selectedResult?.compatible) notified.current = ''
  }, [notice, selectedResult?.compatible])
  const entries = selected || emptySelection ? options : [...options, { ref: value, name: label }]
  return <div className="select settings-control-field">
    <Select value={emptySelection ? null : key} open={open} onOpenChange={next => { setOpen(next); if (next) setRefreshRevision(revision => revision + 1) }} disabled={disabled || !modelBinding}
      onValueChange={next => {
        const item = options.find(item => voiceRefKey(item.ref) === next)
        if (item && results.get(String(next))?.compatible) onChange(item.ref)
      }}>
      <SelectTrigger id={id} className="settings-select-trigger" aria-label={text('voice')} aria-busy={pending || !capabilities}>
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent className="settings-select-content" align="start" side={profilesOnly ? 'top' : 'bottom'} alignItemWithTrigger={false}>
        <SelectGroup>
          {entries.map((item, index) => {
            const itemKey = voiceRefKey(item.ref), result = results.get(itemKey)
            const ready = !pending && !!capabilities && !failed
            const available = ready && result?.compatible === true && index < options.length
            const message = failed ? text('compatibilityFailed') : error ? text('inventoryFailed') : ready && !available ? reason(result) : text('loading')
            return <Tooltip key={itemKey} disabled={available}>
              <TooltipTrigger render={<SelectItem value={itemKey} label={item.name} disabled={!available}
                className="settings-select-item tts-voice-option" aria-description={!available ? message : undefined} />}>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <Badge variant={!ready ? 'secondary' : available ? 'success' : 'danger'}>{text(failed || error ? 'checkFailed' : !ready ? 'loading' : available ? 'available' : 'unavailable')}</Badge>
              </TooltipTrigger>
              {!available && <TooltipContent>{message}</TooltipContent>}
            </Tooltip>
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
}
