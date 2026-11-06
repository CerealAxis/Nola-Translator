import { z } from 'zod'
import { glossarySelectionSchema } from './glossary'
import type { ScreenSource } from './screen-translation'

export const gameProfileSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(80),
  executable: z.string().max(4096).optional(),
  sourceLanguage: z.string().min(1).max(32).default('auto'), targetLanguage: z.string().min(1).max(32).default('zh'),
  source: z.enum(['auto', 'ocr', 'clipboard', 'hook']).default('auto'),
  strategy: z.enum(['auto', 'speed', 'quality']).default('auto'),
  glossarySelection: glossarySelectionSchema.default({ mode: 'auto' }),
  lastOpenedAt: z.string().optional(),
}).strict()
export type GameProfile = z.infer<typeof gameProfileSchema>
export const gameDocumentSchema = z.object({ version: z.literal(1), revision: z.number().int().nonnegative(), profiles: z.array(gameProfileSchema).max(1000) }).strict()
export type GameDocument = z.infer<typeof gameDocumentSchema>
export interface GameTextLine { id: string; text: string; translation?: string; status: 'translating' | 'ready' | 'error' }
export interface GameHookThread { id: string; name: string; code: string; preview: string; selected: boolean; embedSupported: boolean }
export interface GameSnapshot extends GameDocument {
  activeGameId?: string; status: 'idle' | 'running' | 'paused' | 'error';
  source?: 'ocr' | 'clipboard' | 'hook'; lines: GameTextLine[]; error?: string; hookAvailable: boolean;
  sessionId?: string; threads?: GameHookThread[];
}
export const gameCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add') }).strict(),
  z.object({ action: z.literal('saveProfile'), profile: gameProfileSchema, expectedRevision: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal('deleteProfile'), id: z.string().uuid(), expectedRevision: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal('connect'), id: z.string().uuid(), sourceId: z.string().max(256).optional() }).strict(),
  z.object({ action: z.literal('launch'), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('selectThreads'), sessionId: z.string().uuid(), ids: z.array(z.string().max(160)).max(8) }).strict(),
  z.object({ action: z.literal('insertHook'), sessionId: z.string().uuid(), code: z.string().min(1).max(1024).regex(/^[^\r\n\t\0]+$/) }).strict(),
  ...(['pause', 'resume', 'stop'] as const).map(action => z.object({ action: z.literal(action) }).strict()),
])
export type GameCommand = z.infer<typeof gameCommandSchema>
export interface GameTranslationBridge {
  snapshot(): Promise<GameSnapshot>
  sources(): Promise<ScreenSource[]>
  command(command: GameCommand): Promise<GameSnapshot>
  onChanged(listener: (snapshot: GameSnapshot) => void): () => void
}
