import { dialog, type IpcMainInvokeEvent } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ttsVoiceProfileSchema, voiceAssetIdSchema } from '../../shared/tts/voice-profile'
import { ttsVoiceRefSchema } from '../../shared/tts/voice-ref'
import type { DirectModelRequest, DirectModelResult } from '../../shared/agent-workspace'
import type { TtsRuntime } from './tts-runtime'
import { ttsPreviewLanguage } from '../../shared/tts/preview-language'

export function registerVoiceLibraryIpc(runtime: TtsRuntime, options: {
  handle(channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void;
  authorize(event: IpcMainInvokeEvent): void;
  infer(request: DirectModelRequest, signal: AbortSignal): Promise<DirectModelResult>;
}) {
  const handle = (name: string, action: (...args: unknown[]) => unknown) => options.handle(`voices:${name}`, (event, ...args) => {
    options.authorize(event)
    return action(...args)
  })
  handle('list', () => runtime.library.list(true))
  handle('save', (raw, expected) => runtime.library.save(ttsVoiceProfileSchema.parse(raw), z.number().int().positive().optional().parse(expected)))
  handle('delete', (id, expected) => runtime.library.delete(voiceAssetIdSchema.parse(id), z.number().int().positive().parse(expected)))
  handle('capabilities', (binding, refresh, modelId, catalog) => runtime.capabilities(z.string().min(1).max(512).parse(binding),
    z.boolean().optional().parse(refresh), z.string().min(1).max(256).optional().parse(modelId), false, z.boolean().optional().parse(catalog)))
  handle('compatibility', (binding, language, refs, usage) => runtime.compatibility(z.string().min(1).max(512).parse(binding),
    z.string().min(1).max(32).parse(language), z.array(ttsVoiceRefSchema).max(2000).parse(refs), z.enum(['synthesis', 'realtime']).optional().parse(usage)))
  handle('add-provider-voice', (binding, voiceId, name) => runtime.addProviderVoice(z.string().min(1).max(512).parse(binding),
    z.string().trim().min(1).max(512).parse(voiceId), z.string().trim().min(1).max(256).parse(name)))
  handle('bindings', (id, revision) => runtime.library.bindings(voiceAssetIdSchema.parse(id), z.number().int().positive().parse(revision)))
  handle('refresh-binding', (id, revision, bindingId, remove) => runtime.refreshBinding(voiceAssetIdSchema.parse(id),
    z.number().int().positive().parse(revision), voiceAssetIdSchema.parse(bindingId), z.boolean().optional().parse(remove)))
  handle('prepare', (id, revision, binding, text, language) => runtime.prepare(voiceAssetIdSchema.parse(id),
    z.number().int().positive().parse(revision), z.string().min(1).max(512).parse(binding),
    z.string().min(1).max(1000).parse(text), z.string().min(1).max(32).parse(language)))
  handle('audio', async id => {
    const asset = runtime.library.asset(voiceAssetIdSchema.parse(id))
    return `data:${asset.mime};base64,${(await runtime.assets.read(asset)).toString('base64')}`
  })
  handle('import-audio', async (rawId, rawRole) => {
    const id = voiceAssetIdSchema.parse(rawId), role = z.enum(['reference', 'sample', 'consent']).parse(rawRole)
    const selection = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['wav', 'mp3'] }] })
    if (selection.canceled || !selection.filePaths[0]) return null
    if ((await stat(selection.filePaths[0])).size > 32 * 1024 * 1024) throw new Error('voiceReferenceTooLarge')
    const asset = await runtime.assets.write(id, role, await readFile(selection.filePaths[0]))
    runtime.library.addAsset(asset)
    return { assetId: asset.id, mime: asset.mime, durationMs: asset.durationMs }
  })
  handle('preview', async (binding, ref, text, language) => {
    const model = z.string().min(1).max(512).parse(binding), voiceRef = ttsVoiceRefSchema.parse(ref)
    const explicit = z.string().min(1).max(32).optional().parse(language)
    const profile = voiceRef.kind === 'profile' ? runtime.library.profile(voiceRef.profileId, voiceRef.revision) : undefined
    const target = ttsPreviewLanguage(explicit, profile, await runtime.capabilities(model), voiceRef)
    const result = await options.infer({ id: randomUUID(), kind: 'tts', model,
      voiceRef, text: z.string().min(1).max(2000).parse(text), target }, AbortSignal.timeout(120_000))
    if (!result.audio) throw new Error('ttsNoAudio')
    return result.audio
  })
}
