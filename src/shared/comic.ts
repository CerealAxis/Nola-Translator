import { z } from 'zod'
import { glossarySelectionSchema } from './glossary'

export const DEFAULT_COMIC_MODEL = 'cloud:index-translate'
export const COMIC_VISUAL_RESOURCE_IDS = [
  'lama-manga', 'comic-lama-onnx', 'comic-lama-manga-onnx', 'comic-anglenet-onnx',
  'comic-rtdetr-onnx', 'comic-rfdetr-seg-onnx', 'manga-ocr-onnx',
  'baberu-ocr-onnx', 'pp-ocrv6-medium-onnx', 'paddleocr-vl-1.6-onnx',
  'comic-font-classifier-onnx',
  'comic-yuzu-font-onnx',
] as const
export const isManagedComicVisualResource = (resourceId: string): boolean =>
  COMIC_VISUAL_RESOURCE_IDS.some(id => id === resourceId) || /^pp-ocrv5-mobile(?:-[a-z]+)?-onnx$/.test(resourceId)

const id = z.string().uuid()
const sourceQuad = z.array(z.tuple([z.number().finite().nonnegative(), z.number().finite().nonnegative()])).length(4)
const drawingPoint = z.tuple([z.number().finite().nonnegative(), z.number().finite().nonnegative()])
const simplePolygon = z.array(drawingPoint).min(3).max(2000)
export const comicSelectionSchema = z.union([simplePolygon, z.array(z.object({
  op: z.enum(['add', 'subtract']), points: simplePolygon,
}).strict()).min(1).max(64)]).refine(value => value.reduce((sum, item) => sum + ('op' in item ? item.points.length : 1), 0) <= 8000)
export type ComicSelection = z.infer<typeof comicSelectionSchema>
export const comicStyleSchema = z.object({
  fontSize: z.number().int().min(6).max(2000), autoFontSize: z.boolean().optional(),
  angle: z.number().finite().min(-180).max(180).optional(),
  fontFamily: z.string().trim().min(1).max(200).nullish().transform(value => value ?? undefined).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  strokeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  strokeWidth: z.number().finite().min(0).max(100).optional(),
  lineSpacing: z.number().finite().min(0.5).max(3).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  direction: z.enum(['horizontal', 'vertical-rl']), align: z.enum(['left', 'center', 'right']),
}).strict()
export const comicTextRunSchema = z.object({
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
  style: comicStyleSchema.pick({ fontFamily: true, fontSize: true, fontWeight: true,
    fontStyle: true, color: true, strokeColor: true, strokeWidth: true }).partial(),
}).strict().refine(run => run.end > run.start)
export type ComicTextRun = z.infer<typeof comicTextRunSchema>
export const comicRegionSchema = z.object({
  id, sourceText: z.string().max(64000), targetText: z.string().max(64000).nullable(),
  x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(), width: z.number().finite().positive(), height: z.number().finite().positive(),
  sourceQuad: sourceQuad.optional(), sourceLines: z.array(sourceQuad).min(1).max(256).optional(),
  repairPolygon: comicSelectionSchema.optional(), sourceStyle: comicStyleSchema.optional(),
  fontMatch: z.object({ family: z.string().min(1).max(200), confidence: z.number().min(0).max(1),
    model: z.enum(['storia', 'yuzu']).optional(),
    substitution: z.enum(['exact', 'category']).optional(),
    serif: z.boolean().optional(),
    candidates: z.array(z.object({ family: z.string().min(1).max(200), confidence: z.number().min(0).max(1) }).strict()).max(5),
    matchedFamily: z.string().min(1).max(200).optional(), matchedConfidence: z.number().min(0).max(1).optional(), rank: z.number().int().min(1).max(5).optional(),
  }).strict().optional(),
  textRuns: z.array(comicTextRunSchema).max(2048).optional(),
  resolvedLayout: z.object({
    fontSize: z.number().positive(), lineHeight: z.number().positive(),
    x: z.number().finite(), y: z.number().finite(), width: z.number().nonnegative(), height: z.number().nonnegative(),
    lines: z.array(z.string()).max(64000), text: z.string().max(64000),
    direction: z.enum(['horizontal', 'vertical-rl']), angle: z.number().finite(),
    fontFamily: z.string().max(200).optional(), fontWeight: z.number().int().min(100).max(900).optional(), fontStyle: z.enum(['normal', 'italic']).optional(),
  }).strict().optional(),
  confidence: z.number().min(0).max(1).nullable(), locked: z.boolean(), ignored: z.boolean(),
  manuallyEdited: z.boolean().optional(),
  visible: z.boolean().optional(), editLocked: z.boolean().optional(),
  kind: z.enum(['text', 'dialogue', 'artwork']).optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  name: z.string().trim().min(1).max(200).nullish().transform(value => value ?? undefined).optional(),
  style: comicStyleSchema, qa: z.array(z.string().max(100)).max(20),
}).strict().superRefine((region, ctx) => {
  const length = Array.from(region.targetText ?? '').length
  let previousEnd = 0
  region.textRuns?.forEach((run, index) => {
    if (run.end > length || run.start < previousEnd) ctx.addIssue({ code: 'custom', path: ['textRuns', index], message: 'Text ranges must be ordered, non-overlapping and inside the translated text' })
    previousEnd = run.end
  })
})
export type ComicRegion = z.infer<typeof comicRegionSchema>
export const comicMaskStrokeSchema = z.object({ id, mode: z.enum(['erase', 'restore']), size: z.number().finite().min(1).max(200),
  name: z.string().trim().min(1).max(200).optional(), visible: z.boolean().optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  polygon: comicSelectionSchema.optional(),
  points: z.array(z.tuple([z.number().finite().nonnegative(), z.number().finite().nonnegative()])).min(1).max(2000) }).strict()
export type ComicMaskStroke = z.infer<typeof comicMaskStrokeSchema>
export const comicDrawingStrokeSchema = z.object({
  id, mode: z.enum(['brush', 'erase', 'fill']), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  size: z.number().finite().min(1).max(2000),
  points: z.array(drawingPoint).min(1).max(20000),
  clip: comicSelectionSchema.optional(),
  tolerance: z.number().int().min(0).max(255).optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  hardness: z.number().finite().min(0).max(1).optional(),
  contiguous: z.boolean().optional(),
}).strict()
export const comicDrawingLayerSchema = z.object({
  id, name: z.string().trim().min(1).max(200), visible: z.boolean(), locked: z.boolean(),
  opacity: z.number().finite().min(0).max(1),
  strokes: z.array(comicDrawingStrokeSchema).max(1000),
}).strict()
export type ComicDrawingStroke = z.infer<typeof comicDrawingStrokeSchema>
export type ComicDrawingLayer = z.infer<typeof comicDrawingLayerSchema>
export interface ComicFont { family: string; weight: number; italic: boolean }
export interface ComicRepairLayer { id: string; regionId?: string; origin?: 'auto' | 'manual'; name: string; x: number; y: number; width: number; height: number; visible: boolean; opacity: number }
const comicExecutionProviderSchema = z.enum(['cpu', 'cuda', 'dml'])
export type ComicExecutionProvider = z.infer<typeof comicExecutionProviderSchema>
export interface ComicRuntimeStatus {
  availableProviders: ComicExecutionProvider[]
  activeModels: { resourceId: string; provider: ComicExecutionProvider }[]
  cpuPercent: number | null
  memoryUsed: number
  memoryTotal: number
  gpuMemoryUsed: number | null
  gpuMemoryTotal: number | null
}
export const comicConfigSchema = z.object({
  sourceLanguage: z.string().max(32).default('auto'), targetLanguage: z.string().min(1).max(32).default('zh'), model: z.string().max(512).default(''),
  detector: z.enum(['auto', 'ppocr', 'rtdetr', 'rfdetr-seg']).optional(), ocr: z.enum(['auto', 'ppocr', 'manga-ocr', 'baberu', 'ppocrv6', 'paddleocr-vl']).optional(),
  repairMethod: z.enum(['auto', 'telea', 'lama-manga', 'lama']).optional(),
  executionProviders: z.object({ detector: comicExecutionProviderSchema.optional(), ocr: comicExecutionProviderSchema.optional(), repair: comicExecutionProviderSchema.optional() }).strict().optional(),
  readingDirection: z.enum(['rtl', 'ltr']).default('rtl'), glossary: glossarySelectionSchema.default({ mode: 'auto' }),
}).strict()
export type ComicConfig = z.infer<typeof comicConfigSchema>
export const comicArtboardSchema = z.object({
  x: z.number().finite().min(-1_000_000).max(1_000_000), y: z.number().finite().min(-1_000_000).max(1_000_000),
  // Match Python str.strip()/len, including non-ASCII whitespace and emoji labels.
  name: z.string().transform(value => value.replace(/^[\p{White_Space}\u001c-\u001f]+|[\p{White_Space}\u001c-\u001f]+$/gu, ''))
    .refine(value => Array.from(value).length >= 1 && Array.from(value).length <= 200).optional(),
  visible: z.boolean().optional(), locked: z.boolean().optional(), expanded: z.boolean().optional(),
}).strict()
export type ComicArtboard = z.infer<typeof comicArtboardSchema>
export interface ComicPage { id: string; chapterId: string; name: string; width: number; height: number; artboard?: ComicArtboard; regions: ComicRegion[]; maskStrokes?: ComicMaskStroke[]; drawingLayers?: ComicDrawingLayer[]; repairLayers?: ComicRepairLayer[]; backgroundVisible?: boolean; status: 'imported' | 'detected' | 'recognized' | 'translated' | 'rendered'; hasClean: boolean; hasRendered: boolean }
export interface ComicChapter { id: string; title: string }
export interface ComicJob { id: string; state: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'; stage: string; completedPages: number; totalPages: number; error?: string; pageId?: string; issues?: { pageId: string; stage: string; error: string }[] }
export interface ComicProjectSummary { id: string; title: string; revision: number; updatedAt: string; pageCount: number; chapterCount: number }
export interface ComicProject extends ComicProjectSummary { config: ComicConfig; chapters: ComicChapter[]; pages: ComicPage[]; jobs: ComicJob[]; canUndo: boolean; canRedo: boolean }
export const comicEditSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rename'), title: z.string().trim().min(1).max(200) }).strict(),
  z.object({ action: z.literal('configure'), config: comicConfigSchema }).strict(),
  z.object({ action: z.literal('saveRegion'), pageId: id, region: comicRegionSchema }).strict(),
  z.object({ action: z.literal('deleteRegion'), pageId: id, regionId: id }).strict(),
  z.object({ action: z.literal('moveRegion'), pageId: id, regionId: id, index: z.number().int().min(0).max(2048) }).strict(),
  z.object({ action: z.literal('paintMask'), pageId: id, stroke: comicMaskStrokeSchema }).strict(),
  z.object({ action: z.literal('clearMask'), pageId: id }).strict(),
  z.object({ action: z.literal('saveMask'), pageId: id, stroke: comicMaskStrokeSchema }).strict(),
  z.object({ action: z.literal('deleteMask'), pageId: id, strokeId: id }).strict(),
  z.object({ action: z.literal('saveDrawingLayer'), pageId: id, layer: comicDrawingLayerSchema }).strict(),
  z.object({ action: z.literal('deleteDrawingLayer'), pageId: id, layerId: id }).strict(),
  z.object({ action: z.literal('moveDrawingLayer'), pageId: id, layerId: id, index: z.number().int().min(0).max(256) }).strict(),
  z.object({ action: z.literal('setRepairLayer'), pageId: id, layerId: id, name: z.string().trim().min(1).max(200), visible: z.boolean(), opacity: z.number().finite().min(0).max(1), x: z.number().int().nonnegative().optional(), y: z.number().int().nonnegative().optional() }).strict(),
  z.object({ action: z.literal('deleteRepairLayer'), pageId: id, layerId: id }).strict(),
  z.object({ action: z.literal('setBackground'), pageId: id, visible: z.boolean() }).strict(),
  z.object({ action: z.literal('setArtboard'), pageId: id, artboard: comicArtboardSchema }).strict(),
  z.object({ action: z.literal('eraseRepairArea'), pageId: id, polygon: comicSelectionSchema }).strict(),
  z.object({ action: z.literal('addChapter'), title: z.string().trim().min(1).max(200) }).strict(),
  z.object({ action: z.literal('movePage'), pageId: id, chapterId: id, index: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal('deletePage'), pageId: id }).strict(),
  z.object({ action: z.literal('undo') }).strict(), z.object({ action: z.literal('redo') }).strict(),
])
export const comicMutationSchema = z.object({ projectId: id, operationId: id, expectedRevision: z.number().int().nonnegative(), command: comicEditSchema }).strict()
export type ComicMutation = z.infer<typeof comicMutationSchema>
export const comicRunSchema = z.object({ projectId: id, expectedRevision: z.number().int().nonnegative(),
  pageIds: z.array(id).min(1).max(1000), regionId: id.optional(),
  selection: comicSelectionSchema.optional(), overwriteManual: z.boolean().optional(),
  stage: z.enum(['full', 'clean', 'detect', 'ocr', 'translate', 'repair', 'layout']) }).strict()
export type ComicRunRequest = z.infer<typeof comicRunSchema>
export const comicImportSchema = z.object({ projectId: id.optional(), chapterId: id.optional(), title: z.string().trim().min(1).max(200).optional(), kind: z.enum(['auto', 'images', 'folder', 'archive', 'pdf', 'ebook']),
  pdfDpi: z.number().int().min(72).max(600).optional(), firstPage: z.number().int().positive().optional(),
  lastPage: z.number().int().positive().optional(), firstFrame: z.boolean().optional() }).strict()
export type ComicImportRequest = z.infer<typeof comicImportSchema>
export const comicExportSchema = z.object({ projectId: id, kind: z.enum(['images', 'cbz', 'project', 'directory', 'png', 'jpg', 'psd', 'pdf', 'epub', 'json', 'labelplus']), layer: z.enum(['source', 'clean', 'rendered']).optional(), quality: z.number().int().min(1).max(100).optional(), pageIds: z.array(id).min(1).max(1000).optional() }).strict()
export type ComicExportRequest = z.infer<typeof comicExportSchema>
export const comicEditorRequestSchema = z.object({ projectId: id, pageId: id.optional() }).strict()
export type ComicEditorRequest = z.infer<typeof comicEditorRequestSchema>
export interface ComicBridge {
  openEditor(request: ComicEditorRequest): Promise<void>
  onEditorCloseRequested?(callback: () => Promise<void>): () => void
  onEditorPageRequested?(callback: (pageId: string) => void): () => void

  deleteProject(projectId: string): Promise<void>
  restoreProject(projectId: string): Promise<void>
  deleteProjects(projectIds: string[]): Promise<void>
  restoreProjects(projectIds: string[]): Promise<void>
  runtimeStatus(): Promise<ComicRuntimeStatus>
  purgeRuntime(): Promise<void>
  listFonts(): Promise<ComicFont[]>
  importFonts(): Promise<ComicFont[]>
  fontPreview(family: string): Promise<{ image: string; width: number; height: number } | null>
  readFont(family: string, weight?: number, italic?: boolean): Promise<string>
  layerImage(projectId: string, pageId: string, kind: 'repair' | 'drawing' | 'text', layerId: string, maxPixels?: number): Promise<string>
  previewRegion?(projectId: string, pageId: string, region: ComicRegion): Promise<{ image: string; layout: ComicRegion['resolvedLayout'] }>
  thumbnail(projectId: string, pageId: string): Promise<string>
  listProjects(): Promise<ComicProjectSummary[]>
  openProject(projectId: string): Promise<ComicProject>
  importProject(request: ComicImportRequest): Promise<ComicProject | null>
  edit(request: ComicMutation): Promise<ComicProject>
  run(request: ComicRunRequest): Promise<ComicProject>
  cancel(projectId: string, jobId: string): Promise<ComicProject>
  image(projectId: string, pageId: string, kind: 'source' | 'clean' | 'rendered', maxPixels?: number): Promise<string>
  exportProject(request: ComicExportRequest): Promise<boolean>
  onChanged(listener: (event: { projectId: string }) => void): () => void
}
