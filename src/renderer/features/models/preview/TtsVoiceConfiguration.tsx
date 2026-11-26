import { normalizeTtsLanguage } from '../../../../shared/tts/compatibility'
import { mergeTtsCapabilities } from '../../../../shared/tts/capability-overrides'
import { useEffect, useId, useState } from 'react'
import { Ellipsis, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SettingSelect } from '../../settings/SettingsPage'
import { voiceRefKey, parseVoiceRefKey } from '../../../../shared/tts/voice-ref'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group'
import { useI18n } from '@/i18n'
import { ttsText } from '@/i18n/tts-ui'
import { LANGUAGE_CODES } from '../../../../shared/languages'
import type { TtsPresetVoiceDescriptor, TtsModelCapabilities } from '../../../../shared/tts/capabilities'
import type { TtsVoiceRef } from '../../../../shared/tts/voice-ref'
import { ModelLanguageSelect } from '../ModelConfigurationDialog'
import { ModelEditorDialog } from './ModelEditorDialog'

export type TtsVoiceDraft = TtsPresetVoiceDescriptor & { configured: boolean; builtin?: boolean; languageOptions?: string[]; languageConfigured?: boolean; original?: TtsPresetVoiceDescriptor }
export function ttsVoiceDrafts(capabilities: TtsModelCapabilities, saved: TtsPresetVoiceDescriptor[] = [], selected?: TtsVoiceRef, presetVoiceIds?: string[]): TtsVoiceDraft[] {
  const inherited = capabilities.languages.mode === 'finite' ? capabilities.languages.values : capabilities.languages.mode === 'multi' ? capabilities.languages.verifiedValues : undefined
  const effective = mergeTtsCapabilities(capabilities, { presetVoices: saved })
  const voices = new Map(effective.presetVoices.map(voice => [voice.id, { ...voice, languages: voice.languages ?? inherited, languageOptions: voice.metadata?.userDefined === true ? inherited : voice.metadata && 'providerLanguages' in voice.metadata ? (voice.metadata.providerLanguages as string[] | null) ?? inherited : voice.languages ?? inherited, builtin: voice.metadata?.userDefined !== true, configured: false } as TtsVoiceDraft]))
  for (const voice of saved) {
    const effectiveVoice = voices.get(voice.id)
    if (effectiveVoice) voices.set(voice.id, { ...effectiveVoice, languageConfigured: voice.languages !== undefined, original: voice, configured: true })
  }
  if (selected?.kind === 'preset' && !voices.has(selected.voiceId)) voices.set(selected.voiceId, { id: selected.voiceId, name: '', configured: false })
  return presetVoiceIds === undefined ? [...voices.values()] : presetVoiceIds.map(id => voices.get(id) ?? { id, name: id, configured: false, builtin: false, languageOptions: inherited })
}
export function serializeTtsVoices(rows: TtsVoiceDraft[]): TtsPresetVoiceDescriptor[] {
  return rows.filter(row => row.configured).map(row => {
    const { languages: _languages, ...original } = row.original ?? {}
    return { ...original, id: row.id.trim(), name: row.name.trim() || row.id.trim(), ...(row.languageConfigured && row.languages ? { languages: row.languages } : {}) }
  })
}
export function TtsVoiceConfiguration({ rows, onChange, selected, onSelect, capabilities, catalogCapabilities, binding }: {
  rows: TtsVoiceDraft[]; onChange(rows: TtsVoiceDraft[]): void; selected: TtsVoiceRef; onSelect(ref: TtsVoiceRef): void;
  capabilities: TtsModelCapabilities; catalogCapabilities?: TtsModelCapabilities; binding: string;
}) {
  const { language } = useI18n()
  const text = (key: Parameters<typeof ttsText>[1]) => ttsText(language, key)
  const uid = useId()
  const [editing, setEditing] = useState<{ index: number; voice: TtsVoiceDraft; isNew?: boolean }>()
  const displayRows = rows
  const firstVoiceId = rows.find(row => row.id.trim())?.id
  useEffect(() => {
    if (selected.kind === 'engine-default' && firstVoiceId) onSelect({ kind: 'preset', modelBinding: binding, voiceId: firstVoiceId })
  }, [selected, firstVoiceId, binding, onSelect])
  const options = rows.filter(row => row.id.trim()).map(row => ({ value: voiceRefKey({ kind: 'preset', modelBinding: binding, voiceId: row.id }), label: row.id }))
  const value = selected.kind === 'engine-default' ? options[0]?.value ?? '' : selected.kind === 'preset' && !selected.voiceId.trim() ? '' : voiceRefKey(selected)
  if (value && !options.some(option => option.value === value)) options.push({ value, label: selected.kind === 'preset' ? selected.voiceId : selected.kind === 'profile' ? selected.profileId : selected.kind === 'session-speaker' ? selected.speakerId : '' })
  const editId = (voice: TtsVoiceDraft, id: string): TtsVoiceDraft => {
    if (id === voice.id) return voice
    if (id.trim() === voice.id.trim()) return { ...voice, id, configured: true }
    const preset = capabilities.presetVoices.find(item => item.id === id.trim())
    const inherited = capabilities.languages.mode === 'finite' ? capabilities.languages.values : capabilities.languages.mode === 'multi' ? capabilities.languages.verifiedValues : undefined
    const languages = voice.languageConfigured && preset?.languages ? voice.languages?.filter(value => preset.languages!.some(language => normalizeTtsLanguage(language) === normalizeTtsLanguage(value))) : voice.languages
    const keepLanguages = !!voice.languageConfigured && (!preset?.languages || !!languages?.length)
    return { ...voice, id, configured: true, builtin: !!preset, original: undefined, languageConfigured: keepLanguages,
      languageOptions: preset?.languages ?? inherited, languages: keepLanguages ? languages : preset?.languages }
  }
  const updateId = (index: number, id: string) => {
    const previous = displayRows[index]
    onChange(displayRows.map((row, position) => position === index ? editId(row, id) : row))
    if (selected.kind === 'preset' && selected.voiceId === previous.id) onSelect({ ...selected, voiceId: id })
  }
  const descriptor = editing && (catalogCapabilities?.presetVoices.find(voice => voice.id === editing.voice.id.trim()) ?? capabilities.presetVoices.find(voice => voice.id === editing.voice.id.trim()))
  const codes = editing?.voice.languageOptions ?? (editing?.voice.builtin ? descriptor?.languages : undefined) ?? (capabilities.languages.mode === 'finite' ? capabilities.languages.values : LANGUAGE_CODES)
  const valid = !!editing?.voice.id.trim() && !rows.some((row, index) => (editing.isNew || index !== editing.index) && row.id.trim() === editing.voice.id.trim())
  return <>
    <Field>
      <FieldLabel>{text('voiceConfiguration')}</FieldLabel>
      <div className="llm-editor__level-tags">
        {displayRows.map((row, index) => <InputGroup key={index} className="llm-editor__level-input">
          <InputGroupInput aria-label={`Voice ID ${index + 1}`} placeholder="default" value={row.id} maxLength={512} autoComplete="off"
            onChange={event => updateId(index, event.target.value)} />
          <InputGroupAddon align="inline-end" className="tts-voice-config__actions">
            <Button variant="bare" size="icon-xs" tooltip={text('details')} aria-label={`${text('details')} ${row.id || index + 1}`} onClick={() => setEditing({ index, voice: { ...row } })}><Ellipsis aria-hidden="true" /></Button>
            <Button variant="bare" size="icon-xs" aria-label={`${text('remove')} ${row.id || index + 1}`} onClick={() => {
              const remaining = rows.filter((_, position) => position !== index)
              onChange(remaining)
              if (selected.kind === 'preset' && selected.voiceId === row.id) onSelect(remaining[0] ? { kind: 'preset', modelBinding: binding, voiceId: remaining[0].id } : { kind: 'engine-default' })
            }}><X aria-hidden="true" /></Button>
          </InputGroupAddon>
        </InputGroup>)}
        <Button variant="secondary" size="icon-sm" aria-label={text('addVoice')} onClick={() => setEditing({ index: rows.length, voice: { id: '', name: '', configured: true }, isNew: true })}><Plus aria-hidden="true" /></Button>
      </div>
    </Field>
    <Field><FieldLabel htmlFor={uid + '-default'}>{text('defaultVoice')}</FieldLabel><SettingSelect id={uid + '-default'} ariaLabel={text('defaultVoice')} value={value} options={options} isDisabled={!options.length} onChange={key => onSelect(parseVoiceRefKey(key))} /></Field>
    {editing && <ModelEditorDialog title={text('voiceConfiguration')} canSave={valid} onCancel={() => setEditing(undefined)} onSave={() => {
      const previous = editing.isNew ? undefined : displayRows[editing.index]
      const changed = !previous || editing.voice.id.trim() !== previous.id.trim() || editing.voice.name.trim() !== previous.name.trim() || JSON.stringify(editing.voice.languages) !== JSON.stringify(previous.languages) || editing.voice.languageConfigured !== previous.languageConfigured
      const voice = { ...editing.voice, id: editing.voice.id.trim(), name: editing.voice.name.trim() || editing.voice.id.trim(), configured: editing.voice.configured || changed }
      const previousId = previous?.id
      onChange(editing.isNew ? [...rows, voice] : displayRows.map((row, index) => index === editing.index ? voice : row))
      if (selected.kind === 'preset' && selected.voiceId === previousId) onSelect({ ...selected, voiceId: voice.id })
      setEditing(undefined)
    }}>
      <Field><FieldLabel htmlFor={uid + '-id'}>Voice ID</FieldLabel><Input id={uid + '-id'} value={editing.voice.id} maxLength={512} onValueChange={id => setEditing({ ...editing, voice: editId(editing.voice, id) })} /></Field>
      <Field><FieldLabel htmlFor={uid + '-name'}>{text('name')}</FieldLabel><Input id={uid + '-name'} value={editing.voice.name} maxLength={256} onValueChange={name => setEditing({ ...editing, voice: { ...editing.voice, name } })} /></Field>
      <ModelLanguageSelect compact hideArrow genericChinese label={text('supportedLanguages')} value={editing.voice.languages ?? []} codes={codes} onChange={languages => setEditing({ ...editing, voice: { ...editing.voice, languages: languages.length ? languages : undefined, languageConfigured: languages.length > 0 } })} />

    </ModelEditorDialog>}
  </>
}
