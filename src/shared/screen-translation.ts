import { z } from 'zod'
import type { ResourceRecord } from './contracts'
import { isSupportedShortcut } from './keyboard-shortcuts'
import type { AppSettings } from './settings'
import { defaultModelBinding } from './model-policy'
import { normalizeModelBinding } from './model-gateway'
import { glossarySelectionSchema } from './glossary'
import type { ScreenTextProbe } from './screen-visual-probe'

export const MAX_SCREEN_REGIONS = 64

export const screenRegionSchema = z.object({
  id: z.string().uuid(), x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().min(0.005).max(1), height: z.number().min(0.005).max(1),
}).refine(region => region.x + region.width <= 1.001 && region.y + region.height <= 1.001)
export type ScreenRegion = z.infer<typeof screenRegionSchema>
const editorBinding = z.string().max(100).refine(isSupportedShortcut).optional()
export const screenDisplaySchema = z.object({ id: z.string(), width: z.number().positive(), height: z.number().positive(), scale: z.number().positive() })
export const screenRegionSetSchema = z.object({
  sourceId: z.string().max(256).default(''), sourceName: z.string().max(256).default(''),
  display: screenDisplaySchema.optional(), regions: z.array(screenRegionSchema).max(MAX_SCREEN_REGIONS),
})
export const screenPresetSchema = screenRegionSetSchema.extend({ id: z.string().uuid(), name: z.string().trim().min(1).max(80) })
export type ScreenRegionSet = z.infer<typeof screenRegionSetSchema>
export type ScreenRegionPreset = z.infer<typeof screenPresetSchema>
export const screenConfigSchema = z.object({
  captureMode: z.enum(['cursor', 'regions', 'window']).default('cursor'),
  strategy: z.enum(['auto', 'speed', 'quality']).default('auto'),
  glossarySelection: glossarySelectionSchema.default({ mode: 'auto' }),
  sourceId: z.string().max(256).default(''), sourceName: z.string().max(256).default(''),
  windowIdentity: z.string().max(2048).default(''),
  regions: z.array(screenRegionSchema).max(MAX_SCREEN_REGIONS).default([]),
  display: screenDisplaySchema.optional(), presetId: z.string().max(64).default(''),
  reviewRequired: z.boolean().default(false),
  sourceLanguage: z.string().min(1).max(32).regex(/^[a-zA-Z][a-zA-Z0-9-]*$/).default('auto'),
  targetLanguage: z.string().min(1).max(32).default('zh'), model: z.string().max(512).default(''),
  processingMode: z.enum(['default', 'cascade']).optional(),
  intervalMs: z.number().int().min(250).max(3000).default(600),
  fontSize: z.union([z.literal(0), z.number().int().min(12).max(36)]).default(0), opacity: z.number().min(0.35).max(1).default(1),
  showSource: z.boolean().default(false),
  toggleShortcut: z.string().max(100).default('CommandOrControl+Shift+F8'),
  editShortcut: z.string().max(100).default('CommandOrControl+Shift+F9'),
  stopShortcut: z.string().max(100).default('CommandOrControl+Shift+F10'),
  showRegionsShortcut: z.string().max(100).default('CommandOrControl+Shift+F7'),
  editorShortcuts: z.object({ cancel: editorBinding, remove: editorBinding, left: editorBinding, right: editorBinding,
    up: editorBinding, down: editorBinding, fastLeft: editorBinding, fastRight: editorBinding, fastUp: editorBinding, fastDown: editorBinding }).optional(),
})
export type ScreenConfig = z.infer<typeof screenConfigSchema>
export function screenProcessingMode(config: ScreenConfig): 'default' | 'cascade' {
  return config.processingMode ?? 'default'
}
export function screenTranslationModel(config: ScreenConfig, settings: AppSettings): string {
  return screenProcessingMode(config) === 'default'
    ? normalizeModelBinding('mt', settings.modelGateway.mtModel) || defaultModelBinding(settings, 'mt')
    : config.model
}
export const screenShortcutsSchema = screenConfigSchema.pick({ toggleShortcut: true, editShortcut: true, stopShortcut: true, showRegionsShortcut: true, editorShortcuts: true })
export type ScreenShortcuts = z.input<typeof screenShortcutsSchema>
export interface ScreenSource { id: string; name: string; kind: 'screen' | 'window'; preview: string }
export interface ScreenTextBlock {
  id: string; regionId: string; text: string; translation?: string; revision: number;
  x: number; y: number; width: number; height: number; angle: number;
  quad?: number[][];
  appearance?: ScreenAppearance; hidden?: boolean; appearancePending?: boolean;
  visualId?: string;
  status: 'stabilizing' | 'translating' | 'ready' | 'error'
}
export type ScreenStatus = 'ready' | 'starting' | 'running' | 'paused' | 'waiting' | 'editing' | 'error'
export type ScreenError = 'captureFailed' | 'targetUnavailable' | 'targetChanged' | 'ocrFailed' | 'ocrMissing' | 'ocrNotReady' | 'ocrCorrupt' | 'ocrRuntimeUnavailable' | 'translationFailed' | 'shortcutConflict' | 'invalidConfig' | 'backendUnavailable' | 's2sUnsupported' | 'gatewayNotReady' | 'translationModelMissing' | 'translationModelNotReady' | 'regionsMissing' | 'sameLanguage'
export interface ScreenOcrStatus { installed: boolean; state: string; progress?: number; error?: string; languages?: string[]; resource?: ResourceRecord }
export const screenAppearanceSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/), background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  patches: z.array(z.object({ image: z.string().startsWith('data:image/png;base64,').max(8 * 1024 * 1024),
    x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) })).max(256),
})
export type ScreenAppearance = z.infer<typeof screenAppearanceSchema>
export interface ScreenOcrRequest { image: string; language: string; appearance?: boolean; taskMode?: 'realtime' | 'offline' }
export interface ScreenOcrResult {
  width: number; height: number;
  blocks: Array<{ id: string; text: string; confidence: number; quad: Array<[number, number]>; appearance?: ScreenAppearance }>
}
export interface ScreenSnapshot {
  status: ScreenStatus; config: ScreenConfig; sessionId: string; epoch: number;
  blocks: ScreenTextBlock[]; error?: ScreenError; errorId?: string; shortcutError: boolean;
  frames: number; ocrMs: number; translationMs: number;
  presets?: ScreenRegionPreset[]; regionsVisible?: boolean;
  captureRegions?: ScreenRegion[]; overlayVisible?: boolean;
  gameId?: string;
  visualProbes?: ScreenTextProbe[];
}
export const screenCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('configure'), config: screenConfigSchema }),
  z.object({ action: z.literal('shortcuts'), shortcuts: screenShortcutsSchema }),
  z.object({ action: z.literal('shortcutRecording'), active: z.boolean() }),
  z.object({ action: z.literal('toolbarSize'), width: z.number().int().min(200).max(1200), height: z.number().int().min(40).max(600) }),
  ...(['start', 'pause', 'resume', 'stop', 'edit', 'showRegions', 'showToolbar', 'hideToolbar', 'toggleOverlay', 'readOnce'] as const).map(action => z.object({ action: z.literal(action) })),
  z.object({ action: z.literal('savePreset'), name: z.string().trim().min(1).max(80), id: z.string().uuid().optional() }),
  z.object({ action: z.literal('loadPreset'), id: z.union([z.string().uuid(), z.literal('draft')]) }),
  z.object({ action: z.literal('renamePreset'), id: z.string().uuid(), name: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal('deletePreset'), id: z.string().uuid() }),
  z.object({ action: z.literal('regions'), regions: z.array(screenRegionSchema).max(MAX_SCREEN_REGIONS) }),
  z.object({ action: z.literal('cancelEdit') }),
])
export type ScreenCommand = z.input<typeof screenCommandSchema>
export const screenFrameSchema = z.object({
  sessionId: z.string().uuid(), epoch: z.number().int().nonnegative(), width: z.number().int().min(1).max(16384), height: z.number().int().min(1).max(16384),
  regions: z.array(z.object({ regionId: z.string().uuid(), image: z.string().startsWith('data:image/png;base64,').max(24 * 1024 * 1024), hash: z.string().max(64) })).max(MAX_SCREEN_REGIONS),
  observed: z.array(z.object({ regionId: z.string().uuid(), hash: z.string().max(64) })).max(MAX_SCREEN_REGIONS).optional(),
  checked: z.array(z.object({ id: z.string().uuid(), matches: z.boolean() })).max(2048).optional(),
}).refine(frame => frame.regions.reduce((total, region) => total + region.image.length, 0) <= 48 * 1024 * 1024)
export type ScreenFrame = z.infer<typeof screenFrameSchema>
export interface ScreenWindowBootstrap { role: 'capture' | 'editor' | 'overlay' | 'regions' | 'toolbar'; snapshot: ScreenSnapshot }
export interface ScreenTranslationBridge {
  snapshot(): Promise<ScreenSnapshot>
  sources(): Promise<ScreenSource[]>
  command(command: ScreenCommand): Promise<ScreenSnapshot>
  onChanged(callback: (snapshot: ScreenSnapshot) => void): () => void
  windowBootstrap(): Promise<ScreenWindowBootstrap>
  frame(frame: ScreenFrame): Promise<void>
  captureError(): Promise<void>
}
