import { z } from 'zod'
import { glossarySelectionSchema } from './glossary'

const id = z.string().uuid()
export const comicStyleSchema = z.object({
  fontSize: z.number().int().min(6).max(200), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  direction: z.enum(['horizontal', 'vertical-rl']), align: z.enum(['left', 'center', 'right']),
}).strict()
export const comicRegionSchema = z.object({
  id, sourceText: z.string().max(64000), targetText: z.string().max(64000).nullable(),
  x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(), width: z.number().finite().positive(), height: z.number().finite().positive(),
  sourceQuad: z.array(z.tuple([z.number().finite().nonnegative(), z.number().finite().nonnegative()])).length(4).optional(),
  confidence: z.number().min(0).max(1).nullable(), locked: z.boolean(), ignored: z.boolean(),
  style: comicStyleSchema, qa: z.array(z.string().max(100)).max(20),
}).strict()
export type ComicRegion = z.infer<typeof comicRegionSchema>
export const comicMaskStrokeSchema = z.object({ id, mode: z.enum(['erase', 'restore']), size: z.number().finite().min(1).max(200),
  points: z.array(z.tuple([z.number().finite().nonnegative(), z.number().finite().nonnegative()])).min(1).max(2000) }).strict()
export type ComicMaskStroke = z.infer<typeof comicMaskStrokeSchema>
export const comicConfigSchema = z.object({
  sourceLanguage: z.string().max(32).default('auto'), targetLanguage: z.string().min(1).max(32).default('zh'), model: z.string().max(512).default(''),
  readingDirection: z.enum(['rtl', 'ltr']).default('rtl'), glossary: glossarySelectionSchema.default({ mode: 'auto' }),
}).strict()
export type ComicConfig = z.infer<typeof comicConfigSchema>
export interface ComicPage { id: string; chapterId: string; name: string; width: number; height: number; regions: ComicRegion[]; maskStrokes?: ComicMaskStroke[]; status: 'imported' | 'recognized' | 'translated' | 'rendered'; hasClean: boolean; hasRendered: boolean }
export interface ComicChapter { id: string; title: string }
export interface ComicJob { id: string; state: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'; stage: string; completedPages: number; totalPages: number; error?: string }
export interface ComicProjectSummary { id: string; title: string; revision: number; updatedAt: string; pageCount: number; chapterCount: number }
export interface ComicProject extends ComicProjectSummary { config: ComicConfig; chapters: ComicChapter[]; pages: ComicPage[]; jobs: ComicJob[]; canUndo: boolean; canRedo: boolean }
export const comicEditSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rename'), title: z.string().trim().min(1).max(200) }).strict(),
  z.object({ action: z.literal('configure'), config: comicConfigSchema }).strict(),
  z.object({ action: z.literal('saveRegion'), pageId: id, region: comicRegionSchema }).strict(),
  z.object({ action: z.literal('deleteRegion'), pageId: id, regionId: id }).strict(),
  z.object({ action: z.literal('paintMask'), pageId: id, stroke: comicMaskStrokeSchema }).strict(),
  z.object({ action: z.literal('clearMask'), pageId: id }).strict(),
  z.object({ action: z.literal('addChapter'), title: z.string().trim().min(1).max(200) }).strict(),
  z.object({ action: z.literal('movePage'), pageId: id, chapterId: id, index: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal('deletePage'), pageId: id }).strict(),
  z.object({ action: z.literal('undo') }).strict(), z.object({ action: z.literal('redo') }).strict(),
])
export const comicMutationSchema = z.object({ projectId: id, operationId: id, expectedRevision: z.number().int().nonnegative(), command: comicEditSchema }).strict()
export type ComicMutation = z.infer<typeof comicMutationSchema>
export const comicRunSchema = z.object({ projectId: id, expectedRevision: z.number().int().nonnegative(),
  pageIds: z.array(id).min(1).max(1000), stage: z.enum(['full', 'ocr', 'translate', 'repair', 'layout']) }).strict()
export type ComicRunRequest = z.infer<typeof comicRunSchema>
export const comicImportSchema = z.object({ projectId: id.optional(), chapterId: id.optional(), title: z.string().trim().min(1).max(200), kind: z.enum(['images', 'folder', 'archive']) }).strict()
export type ComicImportRequest = z.infer<typeof comicImportSchema>
export const comicExportSchema = z.object({ projectId: id, kind: z.enum(['images', 'cbz', 'project']), pageIds: z.array(id).min(1).max(1000).optional() }).strict()
export type ComicExportRequest = z.infer<typeof comicExportSchema>
export interface ComicBridge {
  listProjects(): Promise<ComicProjectSummary[]>
  openProject(projectId: string): Promise<ComicProject>
  importProject(request: ComicImportRequest): Promise<ComicProject | null>
  edit(request: ComicMutation): Promise<ComicProject>
  run(request: ComicRunRequest): Promise<ComicProject>
  cancel(projectId: string, jobId: string): Promise<ComicProject>
  image(projectId: string, pageId: string, kind: 'source' | 'clean' | 'rendered'): Promise<string>
  exportProject(request: ComicExportRequest): Promise<boolean>
  onChanged(listener: (event: { projectId: string }) => void): () => void
}
