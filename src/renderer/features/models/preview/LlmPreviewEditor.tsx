import { useEffect, useId, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { notifySuccess } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { useI18n } from '@/i18n'
import { LOCAL_LANGUAGE_MODEL_CONTEXT_SIZE, LOCAL_LANGUAGE_MODEL_MIN_CONTEXT_SIZE, LOCAL_REASONING_LEVELS } from '../../../../shared/language-model'
import { llmPreviewCopy } from './llm-preview-copy'
import { ModelEditorDialog } from './ModelEditorDialog'
import { lookupModelDefaults } from './models-dev'

export interface LlmPreviewModel {
  id: string
  name: string
  contextWindow: number
  maxOutputTokens: number
  images: boolean
  video?: boolean
  pdf?: boolean
  reasoningLevels?: string[]
  reasoningLevelsDefault?: boolean
}

interface Props {
  provider: string
  model?: LlmPreviewModel
  existingIds?: readonly string[]
  local?: boolean
  saving?: boolean
  onSave: (model: LlmPreviewModel) => void
  onCancel: () => void
}

const defaultReasoningLevels = ['disabled', 'enabled']

function fields(model?: LlmPreviewModel) {
  return {
    name: model?.name ?? '',
    contextWindow: model ? String(model.contextWindow) : '',
    maxOutputTokens: model ? String(model.maxOutputTokens) : '',
    images: model?.images ?? false,
    video: model?.video ?? false,
    pdf: model?.pdf ?? false,
    reasoningLevels: model?.reasoningLevelsDefault ? [] : model?.reasoningLevels ?? [],
  }
}

type Fields = ReturnType<typeof fields>

function withDefaults(current: Fields, defaults: Partial<Fields>, manual: ReadonlySet<keyof Fields>): Fields {
  return { ...current, ...Object.fromEntries(Object.entries(defaults).filter(([key]) => !manual.has(key as keyof Fields))) }
}

export function LlmPreviewEditor({ provider, model, existingIds = [], local = false, saving, onSave, onCancel }: Props) {
  const { language, t } = useI18n()
  const copy = llmPreviewCopy[language]
  const uid = useId()
  const input = useRef<HTMLInputElement>(null)
  const manual = useRef(new Set<keyof Fields>())
  const [draft, setDraft] = useState(() => fields(model))
  const [idInput, setIdInput] = useState(model?.id ?? '')
  const [smart, setSmart] = useState(true)
  const [lookupId, setLookupId] = useState('')
  const [lookup, setLookup] = useState<{ id: string; status: 'pending' | 'missing' | 'error' | 'matched' }>()
  const id = idInput.trim()
  const duplicate = id !== model?.id && existingIds.includes(id)
  const context = Number(draft.contextWindow)
  const output = Number(draft.maxOutputTokens)
  const minContext = local ? LOCAL_LANGUAGE_MODEL_MIN_CONTEXT_SIZE : 256
  const maxContext = local ? LOCAL_LANGUAGE_MODEL_CONTEXT_SIZE : 10_000_000
  const validLimits = Number.isSafeInteger(context) && context >= minContext && context <= maxContext
    && Number.isSafeInteger(output) && output >= 1 && output <= context
  const showLimitError = !!draft.contextWindow && !!draft.maxOutputTokens && !validLimits
  const valid = !saving && !!id && !duplicate && validLimits && (!local || draft.reasoningLevels.length > 0)
  const status = smart && lookup?.id === id ? lookup.status : undefined
  const lookupStatus = status === 'pending' || (!validLimits && (status === 'missing' || status === 'error')) ? status : undefined
  const reasoningLevels = local || draft.reasoningLevels.length ? draft.reasoningLevels : defaultReasoningLevels
  const missingLocalLevel = LOCAL_REASONING_LEVELS.find(level => !reasoningLevels.includes(level))

  useEffect(() => {
    if (!lookupId || lookupId !== id || duplicate) return
    let active = true
    const timer = window.setTimeout(() => {
      setLookup({ id, status: 'pending' })
      void lookupModelDefaults(provider, id).then(defaults => {
        if (!active) return
        setLookupId('')
        setLookup({ id, status: defaults ? 'matched' : 'missing' })
        if (!defaults) return
        const protectedFields = new Set(manual.current)
        setDraft(current => withDefaults(current, defaults, protectedFields))
        notifySuccess(copy.matched)
      }).catch(() => {
        if (!active) return
        setLookupId('')
        setLookup({ id, status: 'error' })
      })
    }, 350)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [lookupId, id, duplicate, provider, copy.matched])

  function update<K extends keyof Fields>(key: K, value: Fields[K]) {
    manual.current.add(key)
    setDraft(previous => ({ ...previous, [key]: value }))
  }

  function updateId(value: string) {
    setIdInput(value)
    const nextId = value.trim()
    if (nextId === id) return
    const restoringSavedId = nextId === model?.id
    manual.current.clear()
    setLookupId(smart && !restoringSavedId ? nextId : '')
    setLookup(undefined)
    if (restoringSavedId) setDraft(fields(model))
    else setDraft(current => ({ ...current, name: '' }))
  }

  function reset() {
    manual.current.clear()
    setSmart(true)
    setIdInput(model?.id ?? '')
    setDraft(fields(model))
    setLookup(undefined)
    setLookupId('')
  }

  const inputTypes = { images: copy.image, video: copy.video, pdf: 'PDF' } as const
  function choices(values: typeof inputTypes) {
    return Object.entries(values).map(([field, label]) => {
      const key = field as keyof typeof inputTypes
      return <label className="llm-editor__choice" key={key}>
        <Checkbox checked={draft[key]} disabled={local} onCheckedChange={checked => update(key, checked)} />
        <span>{label}</span>
      </label>
    })
  }

  function save() {
    const customLevels = [...new Set(draft.reasoningLevels.map(level => level.trim()).filter(Boolean))]
    const useDefaultLevels = customLevels.length === 0
    onSave({ ...draft, id, name: draft.name.trim() || id, contextWindow: context, maxOutputTokens: output,
      reasoningLevels: useDefaultLevels ? [...defaultReasoningLevels] : customLevels,
      reasoningLevelsDefault: useDefaultLevels })
  }

  return <ModelEditorDialog editing={!!model} canSave={valid} initialFocus={local ? undefined : input}
    onSave={save} onCancel={onCancel} onReset={reset}>
    {!local && <Field className="flex-row items-center justify-between">
      <FieldLabel htmlFor={uid + '-smart'}>{copy.smart}</FieldLabel>
      <Switch id={uid + '-smart'} checked={smart} onCheckedChange={checked => {
        setSmart(checked)
        setLookup(undefined)
        setLookupId('')
      }}><SwitchThumb /></Switch>
    </Field>}
    <Field>
      <FieldLabel htmlFor={uid + '-id'}>{t('settings.modelId')}</FieldLabel>
      <Input ref={input} id={uid + '-id'} value={idInput} onValueChange={updateId} readOnly={local}
        maxLength={256} aria-invalid={duplicate} aria-describedby={uid + '-lookup'} autoComplete="off" spellCheck={false} />
      <div id={uid + '-lookup'} role="status" hidden={!duplicate && !lookupStatus}>
        {duplicate ? <FieldError>{copy.duplicate}</FieldError>
          : lookupStatus ? <FieldDescription>{copy[lookupStatus]}</FieldDescription> : null}
      </div>
    </Field>
    <div className="llm-editor__limits">
      <Field>
        <FieldLabel htmlFor={uid + '-context'}>{t('settings.contextWindow')}</FieldLabel>
        <Input id={uid + '-context'} type="number" min={minContext} max={maxContext} step={1} value={draft.contextWindow} onValueChange={value => update('contextWindow', value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor={uid + '-output'}>{t('settings.maxOutputTokens')}</FieldLabel>
        <Input id={uid + '-output'} type="number" min={1} step={1} max={context || undefined}
          value={draft.maxOutputTokens} onValueChange={value => update('maxOutputTokens', value)} />
      </Field>
    </div>
    {showLimitError && <FieldError>{copy.limits.replace('{min}', minContext.toLocaleString(language)).replace('{max}', maxContext.toLocaleString(language))}</FieldError>}
    <fieldset className="llm-editor__options">
      <legend className="type-body font-medium">{copy.inputs}</legend>
      <label className="llm-editor__choice"><Checkbox checked disabled /><span>{copy.text}</span></label>
      {choices(inputTypes)}
    </fieldset>
    <Field className="llm-editor__levels" role="group" aria-labelledby={uid + '-levels'}>
      <span className="type-body font-medium" id={uid + '-levels'}>{copy.levels}</span>
      <div className="llm-editor__level-tags">
        {reasoningLevels.map((level, index) => <InputGroup key={index} className="llm-editor__level-input">
          <InputGroupInput readOnly={local} autoFocus={!level && index === reasoningLevels.length - 1}
            aria-label={copy.levels + ' ' + (index + 1)} maxLength={64} value={level}
            onChange={event => {
              const value = event.currentTarget.value
              update('reasoningLevels', reasoningLevels.map((item, position) => position === index ? value : item))
            }} />
          <InputGroupAddon align="inline-end">
            <Button variant="bare" size="icon-xs" type="button" aria-label={copy.removeLevel + ' ' + (index + 1)}
              disabled={local && reasoningLevels.length === 1}
              onClick={() => update('reasoningLevels', reasoningLevels.filter((_, position) => position !== index))}><X /></Button>
          </InputGroupAddon>
        </InputGroup>)}
        <Button variant="secondary" size="icon-sm" type="button" disabled={local && !missingLocalLevel}
          aria-label={copy.addLevel} onClick={() => update('reasoningLevels', local
            ? LOCAL_REASONING_LEVELS.filter(level => level === missingLocalLevel || reasoningLevels.includes(level))
            : [...reasoningLevels, ''])}><Plus /></Button>
      </div>
    </Field>
  </ModelEditorDialog>
}
