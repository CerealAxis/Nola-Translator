import { languageName } from '../../../../shared/languages'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AudioPlayer } from '@/components/assistant-ui/native/media-player'
import { useId, useState } from 'react'
import { LoaderCircle, PlugZap } from 'lucide-react'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import { getBridge, stores, useStore } from '@/store'
import { astrBotSpeechBinding, astrBotSpeechPreset } from '../../../../shared/astrbot-speech-presets'
import { customModelsOf } from '../../../../shared/custom-models'
import type { CloudModelListRequest, CloudModelProbeRequest, RemoteChatModel } from '../../../../shared/cloud-model-tools'
import { CHATGPT_PLAN_SERVICE } from '../../../../shared/chatgpt-plan'
import { normalizeThrownError, restoreIpcError } from '../../../../shared/ipc-error'
import { TtsVoiceSelector } from '@/components/tts/TtsVoiceSelector'
import { useTtsCapabilities } from '@/components/tts/use-tts-capabilities'
import type { TtsVoiceRef } from '../../../../shared/tts/voice-ref'
import { SettingSelect } from '../../settings/SettingsPage'
import { ttsFailureReason } from '@/components/tts/tts-error-copy'
import { ttsText } from '@/i18n/tts-ui'
import speechSample from '../../workbench/assets/speech-preview.wav?url'
import { pcmWavData } from '../../workbench/audio-attachment'
import type { CloudModel, Connection } from './cloud-preview-data'
import { useCloudPreviewCopy } from './cloud-preview-copy'
import { ModelEditorDialog } from './ModelEditorDialog'
import { lookupModelDefaults } from './models-dev'

const protocols = ['chat-completions', 'chat-responses', 'anthropic', 'google-native', 'azure-openai', 'ollama'] as const

const failureCopy = {
  CLOUD_MODEL_KEY_REQUIRED: 'keyRequired',
  CLOUD_MODEL_WORKSPACE_REQUIRED: 'workspaceRequired',
  CLOUD_MODEL_INVALID_ADDRESS: 'invalidAddress',
  CLOUD_MODEL_BILLING_REQUIRED: 'billingRequired',
  CLOUD_MODEL_ACCESS_DENIED: 'accessDenied',
  CLOUD_MODEL_RATE_LIMITED: 'rateLimited',
  CLOUD_MODEL_PROVIDER_UNAVAILABLE: 'providerUnavailable',
  CLOUD_MODEL_REQUEST_REJECTED: 'requestRejected',
  CLOUD_MODEL_LIST_UNAVAILABLE: 'remoteEmpty',
  CLOUD_MODEL_AZURE_DEPLOYMENT: 'azureDeployment',
  CLOUD_MODEL_INVALID_RESPONSE: 'invalidList',
  CLOUD_MODEL_NO_TRANSLATION: 'noTranslation',
  CLOUD_MODEL_NO_AUDIO: 'noAudio',
  CLOUD_MODEL_SAMPLE_UNAVAILABLE: 'sampleUnavailable',
} as const

export function useCloudModelFailure() {
  const copy = useCloudPreviewCopy()
  const { language } = useI18n()
  return (operation: 'fetchModelsFailed' | 'connectionFailed' | 'previewFailed', error: unknown, targetLanguage?: string) => {
    const cause = restoreIpcError(error)
    const { code } = normalizeThrownError(cause)
    if (Object.hasOwn(failureCopy, code)) {
      notifyError(copy(operation), { description: copy(failureCopy[code as keyof typeof failureCopy]) })
    } else {
      notifyError(copy(operation), { cause, description: ttsFailureReason(language, cause, targetLanguage) })
    }
  }
}

export async function loadCloudModelList({ id, service, endpoint, protocol, key }: Connection) {
  const list = getBridge()?.app.listCloudModels
  const format = protocols.find(item => item === protocol)
  if (!list || !format) throw new Error('Model list unavailable')
  const request: CloudModelListRequest = { sourceId: id, service, endpoint: endpoint.trim(), protocol: format, key }
  return list(request)
}

export function CloudModelListDialog({ connection, models, creating, onAdd, onClose }: {
  connection: Connection
  models: RemoteChatModel[]
  creating: boolean
  onAdd: (models: CloudModel[]) => Promise<boolean | undefined>
  onClose: () => void
}) {
  const { t } = useI18n()
  const copy = useCloudPreviewCopy()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const existing = new Set(connection.models.map(model => model.id))
  const settings = useStore(stores.settings, state => state.settings)
  const savedCount = settings ? customModelsOf(settings.translation).length : existing.size
  const remaining = Math.max(0, Math.min(100 - existing.size, 100 - savedCount - (settings && creating ? existing.size : 0)))
  const chosen = selected.filter(id => !existing.has(id)).slice(0, remaining)

  const add = async () => {
    setAdding(true)
    try {
      const added = await Promise.all(chosen.map(async id => {
        const remote = models.find(model => model.id === id)
        const defaults = connection.service === CHATGPT_PLAN_SERVICE ? undefined : await lookupModelDefaults(connection.service, id).catch(() => undefined)
        const contextWindow = Math.min(10_000_000, remote?.contextWindow ?? (Number(defaults?.contextWindow) || 4096))
        const maxOutputTokens = Math.min(contextWindow, remote?.maxOutputTokens ?? (Number(defaults?.maxOutputTokens) || 1024))
        const name = (remote?.name || defaults?.name || id).slice(0, 64)
        return { id, name, enabled: true, llm: { id, name, contextWindow, maxOutputTokens,
          images: defaults?.images ?? false, video: defaults?.video, pdf: defaults?.pdf, reasoningLevels: defaults?.reasoningLevels } }
      }))
      if (await onAdd(added)) onClose()
    } finally { setAdding(false) }
  }

  const visible = models.filter(model => [model.id, model.name ?? ''].some(value => value.toLowerCase().includes(query.trim().toLowerCase())))
  return <ModelEditorDialog title={copy('fetchModels')} saveLabel={copy('addSelected')} canSave={chosen.length > 0 && !adding}
    onCancel={() => { if (!adding) onClose() }} onSave={() => void add()}>
    <Input type="search" aria-label={t('workbench.searchModels')} placeholder={t('workbench.searchModels')} value={query} onValueChange={setQuery} />
    {remaining === 0 && <p role="status">{copy('modelLimit')}</p>}
    {!visible.length ? <p className="type-muted">{t('models.noResults')}</p>
      : <ul className="flex flex-col gap-[var(--label-gap)]">
        {visible.map(model => {
          const added = existing.has(model.id)
          const checked = selected.includes(model.id)
          return <li key={model.id}><label className="flex min-h-[var(--field-control-height)] items-center gap-[var(--label-gap)]">
            <Checkbox checked={added || checked} disabled={added || adding || (!checked && chosen.length >= remaining)}
              onCheckedChange={value => setSelected(ids => value ? [...ids, model.id] : ids.filter(id => id !== model.id))} />
            <Tooltip><TooltipTrigger render={<span className="min-w-0 wrap-anywhere" />}>{model.name ?? model.id}</TooltipTrigger><TooltipContent>{model.id}</TooltipContent></Tooltip>
            {added && <span className="type-muted ms-auto">{copy('alreadyAdded')}</span>}
          </label></li>
        })}
      </ul>}
  </ModelEditorDialog>
}

function probeBinding(connection: Connection, model: CloudModel) {
  if (connection.capability === 'LLM') return model.profileId ? `custom:${model.profileId}` : ''
  if (connection.capability === 'S2S') return model.id
  const speech = astrBotSpeechPreset(connection.service)
  if (speech) return astrBotSpeechBinding(speech.id, model.profileId)
  return `cloud:${connection.service === 'index' ? 'index-translate' : connection.service}`
}

export function CloudModelTest({ connection, model, disabled }: { connection: Connection; model: CloudModel; disabled: boolean }) {
  const copy = useCloudPreviewCopy()
  const notifyFailure = useCloudModelFailure()
  const [testing, setTesting] = useState(false)
  const [preview, setPreview] = useState(false)
  const binding = probeBinding(connection, model)
  const probe = getBridge()?.app.probeCloudModel
  const run = async (request: CloudModelProbeRequest) => {
    if (!probe) throw new Error('Cloud model test unavailable')
    return probe(request)
  }
  const test = async () => {
    setTesting(true)
    try {
      const audio = connection.capability === 'ASR' ? await pcmWavData(speechSample).catch(() => {
        throw Object.assign(new Error(), { code: 'CLOUD_MODEL_SAMPLE_UNAVAILABLE' })
      }) : undefined
      const started = performance.now()
      await run({ capability: connection.capability, binding, audio })
      const elapsed = Math.round(performance.now() - started)
      notifySuccess(copy('connectionPassed'), { description: copy('connectionLatency').replace('{ms}', String(elapsed)) })
    } catch (error) {
      notifyFailure('connectionFailed', error)
    } finally { setTesting(false) }
  }
  const tts = connection.capability === 'TTS'
  const label = copy(tts ? 'audition' : 'testConnection')
  return <>
    <Button variant="bare" size="icon-sm" disabled={disabled || !binding || testing}
      tooltip={tts ? label : copy(testing ? 'testingConnection' : 'testConnection')}
      aria-label={label + ' ' + model.id} onClick={tts ? () => setPreview(true) : () => void test()}>
      {testing ? <LoaderCircle className="motion-safe:animate-spin" /> : <PlugZap />}
    </Button>
    {preview && <CloudVoicePreview connection={connection} model={model} onClose={() => setPreview(false)} generate={async (text, voiceRef, targetLanguage) => {
      const { audio } = await run({ capability: 'TTS', binding, text, voiceRef, targetLanguage })
      if (!audio) throw Object.assign(new Error(), { code: 'CLOUD_MODEL_NO_AUDIO' })
      return audio
    }} />}
  </>
}

function CloudVoicePreview({ connection, model, onClose, generate }: {
  connection: Connection; model: CloudModel; onClose: () => void; generate: (text: string, voice: TtsVoiceRef, language: string) => Promise<string>
}) {
  const copy = useCloudPreviewCopy()
  const notifyFailure = useCloudModelFailure()
  const { t, language } = useI18n()
  const textId = useId()
  const voiceId = useId()
  const speech = astrBotSpeechPreset(connection.service)
  const binding = speech ? astrBotSpeechBinding(speech.id, model.profileId) : ''
  const { capabilities } = useTtsCapabilities(binding)
  const initialVoice: TtsVoiceRef = model.tts?.defaultVoiceRef ?? { kind: 'engine-default' }
  const [text, setText] = useState(() => copy('auditionSample'))
  const [voice, setVoice] = useState(initialVoice)
  const [targetLanguage, setTargetLanguage] = useState(stores.settings.getState().settings?.translation.targetLanguage ?? 'zh')
  const [audio, setAudio] = useState('')
  const [loading, setLoading] = useState(false)
  const play = async () => {
    setLoading(true)
    setAudio('')
    try { setAudio(await generate(text.trim(), voice, targetLanguage)) }
    catch (error) { notifyFailure('previewFailed', error, targetLanguage) }
    finally { setLoading(false) }
  }
  return <ModelEditorDialog title={copy('audition')} saveLabel={<>{loading && <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />}{copy('generatePreview')}</>} canSave={!!text.trim() && !loading}
    onCancel={onClose} onSave={() => void play()}>
    <Field>
      <FieldLabel htmlFor={textId}>{copy('auditionText')}</FieldLabel>
      <Textarea id={textId} value={text} maxLength={1000} onChange={event => setText(event.currentTarget.value)} />
    </Field>
    <Field><FieldLabel htmlFor={voiceId + '-language'}>{ttsText(language, 'language')}</FieldLabel>
      <SettingSelect id={voiceId + '-language'} value={targetLanguage} ariaLabel={ttsText(language, 'language')}
        options={(capabilities?.languages.mode === 'finite' ? capabilities.languages.values : [targetLanguage]).map(value => ({ value, label: languageName(value, language) }))}
        onChange={setTargetLanguage} />
    </Field>
    <Field>
      <FieldLabel htmlFor={voiceId}>{t('workbench.voice')}</FieldLabel>
      <TtsVoiceSelector id={voiceId} modelBinding={binding} targetLanguage={targetLanguage} value={voice} onChange={setVoice} disabled={loading} />
    </Field>
    {audio && <AudioPlayer src={audio} title={copy('audition')} className="max-w-none" />}
  </ModelEditorDialog>
}
