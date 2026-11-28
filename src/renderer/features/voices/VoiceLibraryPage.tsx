import { useEffect, useRef, useState } from 'react'
import { Play, Pencil, Trash2, Plus, Search, Ellipsis, RefreshCw, Upload } from 'lucide-react'
import { useI18n } from '@/i18n'
import { getBridge, stores, useStore } from '@/store'
import { useAvailableModels } from '@/available-models'
import { ttsText } from '@/i18n/tts-ui'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogCloseButton } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ttsFailureReason } from '@/components/tts/tts-error-copy'
import { notifyError, notifyInfo, notifySuccess } from '@/components/primitives/notify'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { TooltipHint } from '@/components/ui/tooltip'
import { useVoiceCompatibility } from '@/components/tts/use-voice-compatibility'
import type { TtsVoiceBinding } from '../../../shared/tts/voice-binding'
import { AudioPlayer } from '@/components/assistant-ui/native/media-player'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { SettingSelect } from '../settings/SettingsPage'
import type { TtsVoiceProfile } from '../../../shared/tts/voice-profile'
import type { TtsModelCapabilities } from '../../../shared/tts/capabilities'
import { voiceRefKey, type TtsVoiceRef } from '../../../shared/tts/voice-ref'
import { ttsPreviewLanguage } from '../../../shared/tts/preview-language'
import { astrBotSpeechBinding } from '../../../shared/astrbot-speech-presets'
import { ttsCatalogCapabilities } from '../../../shared/tts/catalog'
import { mergeTtsCapabilities } from '../../../shared/tts/capability-overrides'
import { ProviderVoicesDialog } from './ProviderVoicesDialog'

type VoiceTile = { name: string; ref: TtsVoiceRef; profile?: TtsVoiceProfile }

export function VoiceLibraryPage() {
  const { language } = useI18n()
  const text = (key: Parameters<typeof ttsText>[1]) => ttsText(language, key)
  const api = getBridge()?.voices
  const available = useAvailableModels()
  const workspace = useStore(stores.settings, state => state.settings?.modelWorkspace)
  const configured = (workspace?.connections ?? []).filter(connection => connection.capability === 'TTS').flatMap(connection =>
    connection.models.map(model => {
      const binding = astrBotSpeechBinding(connection.service as Parameters<typeof astrBotSpeechBinding>[0], model.profileId)
      return { binding, name: connection.models.length === 1 ? connection.name : model.name,
        capabilities: mergeTtsCapabilities(ttsCatalogCapabilities(connection.service, model.id, binding), model.tts?.capabilityOverride, model.tts?.presetVoiceIds) }
    }))
  const catalog = { tts: [...new Map([...available.tts, ...configured].map(model => [model.binding, model])).values()] }
  const [profiles, setProfiles] = useState<TtsVoiceProfile[]>([])
  const [inventory, setInventory] = useState<Record<string, TtsModelCapabilities>>({})
  const capabilities: Record<string, TtsModelCapabilities> = Object.fromEntries(configured.map(model => [model.binding, model.capabilities]))
  for (const [binding, value] of Object.entries(inventory)) if (!capabilities[binding] || capabilities[binding].modelId === value.modelId) capabilities[binding] = value
  const [model, setModel] = useState('')
  const binding = model || catalog.tts[0]?.binding || ''
  const capability = capabilities[binding]
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<TtsVoiceProfile>()
  const [selected, setSelected] = useState<VoiceTile>()
  const [originalRevision, setOriginalRevision] = useState<number>()
  const [deleting, setDeleting] = useState<TtsVoiceProfile>()
  const [fileName, setFileName] = useState('')
  const [providerDialog, setProviderDialog] = useState(false)
  const [bindings, setBindings] = useState<TtsVoiceBinding[]>([])
  const [remoteDeleting, setRemoteDeleting] = useState<TtsVoiceBinding>()
  const [preparing, setPreparing] = useState<{ profile: TtsVoiceProfile; binding: string; text: string; language: string }>()
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [sampleText, setSampleText] = useState('')
  const [audio, setAudio] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const addTrigger = useRef<HTMLButtonElement | null>(null)
  const refresh = async () => {
    try { if (api) setProfiles(await api.list()) }
    catch (cause) { notifyError(text('inventoryFailed'), { cause }) }
  }
  const catalogKey = JSON.stringify([available.tts.map(item => item.binding), configured.map(item => [item.binding, item.capabilities])])
  useEffect(() => { void refresh() }, [api])
  useEffect(() => {
    let active = true
    setInventory({})
    if (api) void Promise.allSettled(available.tts.map(async item => [item.binding, await api.capabilities(item.binding)] as const)).then(results => {
      if (active) {
        setInventory(Object.fromEntries(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])))
        const failure = results.find(result => result.status === 'rejected')
        if (failure?.status === 'rejected') notifyError(text('inventoryFailed'), { cause: failure.reason })
      }
    })
    return () => { active = false }
  }, [api, catalogKey])
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try { await action() } catch (cause) { notifyError(text('failed'), { cause, description: ttsFailureReason(language, cause, previewLanguage || undefined) }) } finally { setBusy(false) }
  }
  const designModels = catalog.tts.filter(item => capabilities[item.binding]?.supports.voiceDesign === true)
  const cloneModels = catalog.tts.filter(item => capabilities[item.binding]?.supports.cloning === true)
  const design = draft?.representations.find(item => item.kind === 'design-recipe')
  const reference = draft?.representations.find(item => item.kind === 'reference-audio')
  const originalDesign = profiles.find(item => item.id === draft?.id)?.representations.find(item => item.kind === 'design-recipe')
  const unchangedDesign = !!originalRevision && JSON.stringify(originalDesign) === JSON.stringify(design)
  const authoringCapability = design?.authoringModelBinding ? capabilities[design.authoringModelBinding] : undefined
  const close = () => { setDraft(undefined); setSelected(undefined); setAudio(null); setFileName('') }
  useEffect(() => {
    let active = true
    setBindings([])
    const profile = selected?.profile
    if (profile && api) void api.bindings(profile.id, profile.revision).then(items => { if (active) setBindings(items) })
      .catch(cause => { if (active) notifyError(text('failed'), { cause }) })
    return () => { active = false }
  }, [selected?.profile?.id, selected?.profile?.revision, api])
  const openTile = (tile: VoiceTile, edit: boolean, element: HTMLElement) => {
    opener.current = element
    setSelected(tile); setDraft(edit && tile.profile ? structuredClone(tile.profile) : undefined)
    setOriginalRevision(edit ? tile.profile?.revision : undefined); setAudio(null)
    const assetId = tile.profile?.lockedSampleAssetId ?? tile.profile?.primaryReferenceAssetId
      ?? tile.profile?.representations.find(item => item.kind === 'reference-audio')?.assetId
    if (assetId) void run(async () => { setAudio(await api!.audio(assetId)) })
  }
  const create = (kind: 'clone' | 'design', keepDraft = false) => {
    opener.current = addTrigger.current
    const now = new Date().toISOString()
    setSelected(undefined); setAudio(null); setOriginalRevision(undefined); setFileName('')
    const authoringModelBinding = designModels.some(item => item.binding === binding) ? binding : designModels[0]?.binding
    setDraft({ schemaVersion: 1, id: keepDraft && draft ? draft.id : crypto.randomUUID(), revision: 1,
      name: keepDraft && draft ? draft.name : '',
      kind, representations: kind === 'design'
      ? [{ kind: 'design-recipe', description: '', recipe: {}, recipeSchema: 'nola-description-v1', authoringModelBinding }]
      : [], createdAt: keepDraft && draft ? draft.createdAt : now, updatedAt: now })
  }
  const tiles: VoiceTile[] = [
    ...(capability?.presetVoices.map(voice => ({ name: voice.name, ref: { kind: 'preset' as const, modelBinding: binding, voiceId: voice.id } })) ?? []),
    ...profiles.filter(profile => !profile.deletedAt).map(profile => ({ name: profile.name, profile,
      ref: { kind: 'profile' as const, profileId: profile.id, revision: profile.revision } })),
  ].filter(item => item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const previewLanguage = selected && capability ? ttsPreviewLanguage(undefined, selected.profile, capability, selected.ref) : ''
  const previewCompatibility = useVoiceCompatibility(binding, previewLanguage ? [previewLanguage] : [], selected ? [selected.ref] : [])
  const selectedCompatibility = selected ? previewCompatibility.results.get(voiceRefKey(selected.ref)) : undefined
  const panelOpen = !!draft || !!selected
  const updateDesign = (patch: Partial<NonNullable<typeof design>>) => setDraft(current => current && ({ ...current,
    representations: current.representations.map(item => item.kind === 'design-recipe' ? { ...item, ...patch } : item) }))
  return <section className="flex min-w-0 flex-col gap-[var(--panel-gap)] p-[var(--page-padding)]">
    <header className="flex flex-wrap items-center justify-between gap-[var(--label-gap)]">
      <h1 className="type-h3">{text('title')}</h1>
      <div className="flex items-center gap-[var(--label-gap)]">
        {capability?.voiceRegistration?.inspect && <Button variant="secondary" onClick={() => setProviderDialog(true)}>{text('providerVoices')}</Button>}
        {(capability?.supports.cloning === true || capability?.supports.voiceDesign === true) &&
          <Button ref={addTrigger} disabled={!api || busy} onClick={() => create(capability.supports.voiceDesign === true ? 'design' : 'clone')}>
            <Plus aria-hidden="true" />{text('designVoice')}
          </Button>}
      </div>
    </header>
    <div className="flex flex-wrap items-center gap-[var(--field-gap)]">
      <div className="relative min-w-0 flex-1"><Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-nola-ui-muted-foreground" />
        <Input id="voice-search" type="search" className="ps-9" aria-label={text('search')} placeholder={text('search')} value={search} onValueChange={setSearch} /></div>
      <SettingSelect id="voice-model" value={binding} ariaLabel={text('model')} options={catalog.tts.map(item => ({ value: item.binding, label: item.name }))}
        onChange={value => { setModel(value); if (selected?.ref.kind === 'preset') close() }} />

    </div>
    <div className="min-w-0">
      <div className="min-w-0">
        {tiles.length ? <div className="grid gap-[var(--field-gap)] sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {tiles.map(tile => <Card key={voiceRefKey(tile.ref)} data-testid="voice-tile" className="group flex min-w-0 flex-col gap-[var(--field-gap)] p-[var(--panel-padding)]">
            <div className="flex min-w-0 items-center gap-[var(--field-gap)]">
              <Avatar size="lg"><AvatarFallback>{Array.from(tile.name).slice(0, 2).join('')}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1"><h2 className="truncate type-body font-medium">{tile.name}</h2>
                {tile.profile && <span className="type-muted">{new Date(tile.profile.createdAt).toLocaleDateString(language)}</span>}</div>
            </div>
            <div className="flex items-center justify-end gap-[var(--label-gap)] opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
              <Button variant="secondary" size="icon-sm" tooltip={text('preview')} aria-label={`${text('preview')} ${tile.name}`} disabled={busy}
                onClick={event => openTile(tile, false, event.currentTarget)}><Play aria-hidden="true" /></Button>
              {tile.profile && <><Button variant="bare" size="icon-sm" tooltip={text('edit')} aria-label={`${text('edit')} ${tile.name}`} disabled={busy}
                onClick={event => openTile(tile, true, event.currentTarget)}><Pencil aria-hidden="true" /></Button>
              <Button variant="bare" size="icon-sm" tooltip={text('delete')} aria-label={`${text('delete')} ${tile.name}`} disabled={busy} onClick={() => setDeleting(tile.profile)}><Trash2 aria-hidden="true" /></Button></>}
            </div>
          </Card>)}
        </div> : <Empty><EmptyHeader><EmptyTitle>{text(search ? 'noResults' : 'empty')}</EmptyTitle></EmptyHeader></Empty>}
      </div>
    </div>
    <Dialog open={panelOpen} onOpenChange={open => { if (!open && !busy) close() }}>
      <DialogContent finalFocus={opener} className="overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between gap-[var(--label-gap)]">
          <DialogTitle>{draft ? text(originalRevision ? 'edit' : 'designVoice') : selected?.name}</DialogTitle>
          {selected?.profile && <Popover><PopoverTrigger render={<Button variant="bare" size="icon-sm" />} aria-label={text('details')}><Ellipsis aria-hidden="true" /></PopoverTrigger>
            <PopoverContent align="end">
              {bindings.length === 0 && <span className="type-muted">{text('pending')}</span>}
              {bindings.map(item => <div key={item.id} className="flex min-w-0 items-center gap-[var(--label-gap)]">
                <TooltipHint content={text(item.status === 'ready' ? 'ready' : item.status === 'processing' || item.status === 'creating' ? 'processing' : 'expired')}><span className="min-w-0 flex-1 truncate type-small">{item.voiceId ?? item.providerId}</span></TooltipHint>
                {capability?.voiceRegistration?.inspect && <Button variant="bare" size="icon-sm" aria-label={text('refresh')} disabled={busy} onClick={() => void run(async () => {
                  await api?.refreshBinding(item.profileId, item.profileRevision, item.id)
                  setBindings(await api!.bindings(item.profileId, item.profileRevision)); await refresh()
                })}><RefreshCw aria-hidden="true" /></Button>}
                {capability?.voiceRegistration?.delete && item.status !== 'deleted' && <Button variant="bare" size="icon-sm" aria-label={text('remoteDelete')} disabled={busy} onClick={() => setRemoteDeleting(item)}><Trash2 aria-hidden="true" /></Button>}
              </div>)}
            </PopoverContent>
          </Popover>}
        </DialogHeader>
        <DialogCloseButton disabled={busy} />
        <div className="-m-[var(--space-1)] flex min-h-0 min-w-0 flex-col gap-[var(--field-gap)] overflow-y-auto p-[var(--space-1)]">
        {draft && <FieldGroup>
          {!originalRevision && capability?.supports.cloning === true && capability.supports.voiceDesign === true &&
            <Field><FieldLabel htmlFor="voice-method">{text('voiceMethod')}</FieldLabel><SettingSelect id="voice-method" ariaLabel={text('voiceMethod')}
              value={draft.kind} options={[{ value: 'design', label: text('fromDescription') }, { value: 'clone', label: text('fromAudio') }]}
              onChange={value => create(value as 'design' | 'clone', true)} /></Field>}
          <Field><FieldLabel htmlFor="voice-name">{text('name')}</FieldLabel><Input autoFocus id="voice-name" value={draft.name} maxLength={256} onValueChange={name => setDraft({ ...draft, name })} /></Field>
          {draft.kind === 'design' ? <>
            <Field><FieldLabel htmlFor="voice-description">{text('description')}</FieldLabel><Textarea id="voice-description" value={design?.description ?? ''} maxLength={8000} onChange={event => updateDesign({ description: event.target.value })} /></Field>
            <Field><FieldLabel htmlFor="voice-authoring-model">{text('authoringModel')}</FieldLabel>
              {originalRevision ? <SettingSelect id="voice-authoring-model" ariaLabel={text('authoringModel')}
                value={design?.authoringModelBinding ?? ''} options={designModels.map(item => ({ value: item.binding, label: item.name }))}
                onChange={authoringModelBinding => updateDesign({ authoringModelBinding, recipe: {}, recipeSchema: 'nola-description-v1', seed: capabilities[authoringModelBinding]?.supports.seed ? design?.seed : undefined })} />
                : <Input id="voice-authoring-model" value={catalog.tts.find(item => item.binding === binding)?.name ?? binding} readOnly />}</Field>
          </> : draft.kind === 'clone' && <>
            <Field className="rounded-[var(--field-radius)] border border-dashed border-nola-ui-border p-[var(--panel-padding)]">
              <FieldLabel>{text('referenceAudio')}</FieldLabel>
              <span className="type-muted">{text('audioFormats')}</span>
              <Button variant="secondary" className="self-start" disabled={busy} onClick={() => void run(async () => {
              const asset = await api?.importAudio(draft.id, 'reference')
              if (asset) {
                setDraft({ ...draft, primaryReferenceAssetId: asset.assetId, representations: [
                  ...draft.representations.filter(item => item.kind !== 'reference-audio' || item.assetId !== draft.primaryReferenceAssetId),
                  { kind: 'reference-audio', assetId: asset.assetId, durationMs: asset.durationMs, transcript: reference?.transcript },
                ] })
                setFileName(asset.fileName)
                setAudio(await api!.audio(asset.assetId))
              }
            })}><Upload aria-hidden="true" />{reference ? text('replaceAudio') : text('chooseAudio')}</Button>
              {reference && <span className="type-muted">{fileName || text('audioSelected')}{reference.durationMs ? ` · ${Math.round(reference.durationMs / 1000)} s` : ''}</span>}
            </Field>
            {reference && <Field><FieldLabel htmlFor="voice-transcript">{text('transcript')}</FieldLabel><Textarea id="voice-transcript" value={reference.transcript ?? ''}
              onChange={event => setDraft({ ...draft, representations: draft.representations.map(item => item.kind === 'reference-audio' ? { ...item, transcript: event.target.value } : item) })} /></Field>}
          </>}
          {design && authoringCapability?.supports.seed && <Field><FieldLabel htmlFor="voice-seed">{text('seed')}</FieldLabel><Input id="voice-seed" type="number" value={design.seed ?? ''}
            onValueChange={value => updateDesign({ seed: value === '' ? undefined : Number(value) })} /></Field>}
        </FieldGroup>}
        {selected && !draft && <FieldGroup>
          <Field><FieldLabel htmlFor="voice-text">{text('previewText')}</FieldLabel><Textarea autoFocus id="voice-text" value={sampleText} maxLength={2000} onChange={event => setSampleText(event.target.value)} /></Field>
          {selectedCompatibility && !selectedCompatibility.compatible && <p role="status" className="type-muted">{text('incompatible')}</p>}
        </FieldGroup>}
        {audio && <AudioPlayer key={audio} src={audio} title={draft?.name || selected?.name || text('preview')} durationMs={reference?.durationMs} className="max-w-none" />}
        </div>
        <DialogFooter>
          {draft ? <>
            <Button variant="secondary" disabled={busy} onClick={close}>{text('cancel')}</Button>
            <Button disabled={busy || !draft.name.trim() || (draft.kind === 'design' ? !design?.description.trim() || (!authoringCapability?.supports.voiceDesign && !unchangedDesign) : draft.kind === 'clone' && (!reference || capability?.reference?.transcriptRequired && !reference.transcript?.trim()))} onClick={() => void run(async () => {
              if (!api) return
              await api.save(draft, originalRevision); notifySuccess(text('saved')); close(); await refresh()
            })}>{text('save')}</Button>
          </> : <>
            <Button variant="secondary" disabled={busy} onClick={close}>{text('close')}</Button>
          <Button aria-busy={generating} disabled={busy || !binding || !sampleText.trim() || previewCompatibility.pending || selectedCompatibility?.compatible === false} onClick={() => {
            setGenerating(true)
            setAudio(null)
            void run(async () => {
              if (api && selected) { setAudio(await api.preview(binding, selected.ref, sampleText, previewLanguage)); await refresh() }
            }).finally(() => setGenerating(false))
          }}>{generating && <Spinner />}{text(generating ? 'generating' : 'generate')}</Button>
          {selected?.profile && selected.profile.kind !== 'imported' && (selected.profile.kind === 'design' && !selected.profile.lockedSampleAssetId ? capability?.supports.voiceDesign : capability?.supports.cloning) === true && capability?.conditioning?.includes('provider-voice') && capability.voiceRegistration?.create && <Button variant="secondary" disabled={busy || !sampleText.trim()}
            onClick={() => setPreparing({ profile: selected.profile!, binding, text: sampleText,
              language: previewLanguage })}>{text('prepare')}</Button>}
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {providerDialog && <ProviderVoicesDialog binding={binding} onClose={() => setProviderDialog(false)} onSaved={() => void refresh()} />}
    <AlertDialog open={!!preparing} onOpenChange={open => { if (!open) setPreparing(undefined) }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{text('prepare')}</AlertDialogTitle><AlertDialogDescription>{text('prepareHint')}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>{text('cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => void run(async () => {
        if (!preparing || !api) return
        const result = await api.prepare(preparing.profile.id, preparing.profile.revision, preparing.binding, preparing.text, preparing.language)
        setBindings(await api.bindings(preparing.profile.id, preparing.profile.revision)); setPreparing(undefined)
        if (result.status === 'ready') notifySuccess(text('ready'))
        else if (result.status === 'processing' || result.status === 'creating') notifyInfo(text('processing'))
        else notifyError(text('failed'))
        await refresh()
      })}>{text('prepare')}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
    <AlertDialog open={!!remoteDeleting} onOpenChange={open => { if (!open) setRemoteDeleting(undefined) }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{text('remoteDelete')}</AlertDialogTitle><AlertDialogDescription>{remoteDeleting?.voiceId}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>{text('cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => void run(async () => {
        if (!remoteDeleting || !api) return
        await api.refreshBinding(remoteDeleting.profileId, remoteDeleting.profileRevision, remoteDeleting.id, true)
        setBindings(await api.bindings(remoteDeleting.profileId, remoteDeleting.profileRevision)); setRemoteDeleting(undefined); await refresh()
      })}>{text('remoteDelete')}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
    <AlertDialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(undefined) }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{text('delete')}</AlertDialogTitle><AlertDialogDescription>{deleting?.name}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>{text('cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => void run(async () => {
        if (deleting && api) { await api.delete(deleting.id, deleting.revision); setDeleting(undefined); if (selected?.profile?.id === deleting.id || draft?.id === deleting.id) close(); await refresh() }
      })}>{text('delete')}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </section>
}
