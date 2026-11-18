import { z } from 'zod'
import { glossarySelectionSchema } from './glossary'

const id = z.string().uuid()
const color = z.string().regex(/^#[a-f\d]{6}$/i)
export function validComicQuad(points: [number, number][]) {
  if (points.length !== 4) return false
  const crosses = points.map((a, index) => {
    const b = points[(index + 1) % 4],
      c = points[(index + 2) % 4]
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
  })
  return (
    crosses.every((value) => value > 1) || crosses.every((value) => value < -1)
  )
}
export const comicStyleSchema = z
  .object({
    fontFamily: z.string().min(1).max(200).optional(),
    fontSize: z.number().min(6).max(200),
    autoFontSize: z.boolean().optional(),
    color,
    direction: z.enum(['horizontal', 'vertical-rl']),
    autoFont: z.boolean().optional(),
    autoLineSpacing: z.boolean().optional(),
    autoAlign: z.boolean().optional(),
    autoBlockAlign: z.boolean().optional(),
    align: z.enum(['left', 'center', 'right']),
    blockAlign: z.enum(['left', 'center', 'right']).optional(),
    angle: z.number().min(-180).max(180).optional(),
    strokeColor: color.optional(),
    strokeWidth: z.number().min(0).max(100).optional(),
    lineSpacing: z.number().min(0.5).max(3).optional(),
  })
  .strict()
export const comicRegionSchema = z
  .object({
    id,
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
    sourceText: z.string().max(64000),
    targetText: z.string().max(64000).nullable(),
    sourceQuad: z
      .array(z.tuple([z.number().nonnegative(), z.number().nonnegative()]))
      .length(4)
      .optional(),
    sourceLines: z
      .array(
        z
          .array(z.tuple([z.number().nonnegative(), z.number().nonnegative()]))
          .length(4),
      )
      .max(256)
      .optional(),
    sourceFontSize: z.number().positive().max(4096).optional(),
    textQuad: z
      .array(z.tuple([z.number().nonnegative(), z.number().nonnegative()]))
      .length(4)
      .refine(validComicQuad)
      .optional(),
    confidence: z.number().min(0).max(1).nullable(),
    locked: z.boolean(),
    ignored: z.boolean(),
    manuallyEdited: z.boolean().optional(),
    style: comicStyleSchema,
    qa: z.array(z.string()).max(20),
    resolvedLayout: z
      .object({
        fontSize: z.number(),
        lines: z.array(z.string()),
        lineHeight: z.number(),
        fontFamily: z.string().optional(),
        lineSpacing: z.number().optional(),
        glyphAdvance: z.number().optional(),
        align: z.enum(['left', 'center', 'right']).optional(),
        blockAlign: z.enum(['left', 'center', 'right']).optional(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        direction: z.string(),
        angle: z.number(),
      })
      .passthrough()
      .optional(),
  })
  .strict()
export type ComicRegion = z.infer<typeof comicRegionSchema>
export const comicMaskStrokeSchema = z
  .object({
    id,
    mode: z.enum(['erase', 'restore']),
    size: z.number().min(1).max(200),
    points: z
      .array(z.tuple([z.number().nonnegative(), z.number().nonnegative()]))
      .min(1)
      .max(20000),
  })
  .strict()
export type ComicMaskStroke = z.infer<typeof comicMaskStrokeSchema>
export const comicRenderSettingsSchema = z
  .object({
    autoFont: z.boolean().default(true),
    autoLineSpacing: z.boolean().default(true),
    autoAlign: z.boolean().default(true),
    autoBlockAlign: z.boolean().default(true),
    fontFamily: z.string().min(1).max(200).default('Noto Sans SC'),
    fontSize: z.number().min(6).max(200).default(23),
    autoSize: z.boolean().default(true),
    direction: z.enum(['auto', 'horizontal', 'vertical-rl']).default('auto'),
    color: color.default('#222222'),
    autoColor: z.boolean().default(true),
    strokeColor: color.default('#ffffff'),
    strokeWidth: z.number().min(0).max(10).default(0),
    lineSpacing: z.number().min(0.5).max(3).default(1.4),
    align: z.enum(['left', 'center', 'right']).default('center'),
    blockAlign: z.enum(['left', 'center', 'right']).default('center'),
    fillColor: color.default('#ffffff'),
  })
  .strict()
export type ComicRenderSettings = z.infer<typeof comicRenderSettingsSchema>
export const comicConfigSchema = z
  .object({
    sourceLanguage: z.string().min(1).max(32).default('ja'),
    targetLanguage: z.string().min(1).max(32).default('zh'),
    normalModel: z.string().max(512).default(''),
    visualModel: z.string().max(512).default(''),
    proofModel: z.string().max(512).default(''),
    rounds: z.number().int().min(1).max(3).default(2),
    detector: z.enum(['auto', 'ppocr', 'rtdetr', 'rfdetr-seg']).default('auto'),
    ocr: z.enum(['auto', 'ppocr', 'manga-ocr']).default('auto'),
    repairMethod: z
      .enum(['auto', 'lama-manga', 'telea', 'solid'])
      .default('auto'),
    glossary: glossarySelectionSchema.default({ mode: 'auto' }),
    excludedSelection: glossarySelectionSchema.default({ mode: 'auto' }),
    renderSettings: comicRenderSettingsSchema.default(() =>
      comicRenderSettingsSchema.parse({}),
    ),
  })
  .strict()
export type ComicConfig = z.infer<typeof comicConfigSchema>
export interface ComicPage {
  id: string
  chapterId: string
  name: string
  width: number
  height: number
  regions: ComicRegion[]
  status: 'imported' | 'detected' | 'recognized' | 'translated' | 'rendered'
  hasClean: boolean
  hasRendered: boolean
  maskStrokes?: ComicMaskStroke[]
  revision?: number
}
export interface ComicProjectSummary {
  id: string
  title: string
  revision: number
  updatedAt: string
  pageCount: number
  chapterCount: number
  coverPageId?: string
  quick?: boolean
}
export interface ComicProject extends ComicProjectSummary {
  config: ComicConfig
  chapters: { id: string; title: string }[]
  pages: ComicPage[]
  canUndo: boolean
  canRedo: boolean
}
export const comicProjectSummarySchema = z.object({
  id, title: z.string(), revision: z.number().int().nonnegative(), updatedAt: z.string(),
  pageCount: z.number().int().nonnegative(), chapterCount: z.number().int().nonnegative(),
  coverPageId: id.nullish().transform(value => value ?? undefined), quick: z.boolean().optional(),
})
export const comicProjectSchema: z.ZodType<ComicProject> = comicProjectSummarySchema.extend({
  config: comicConfigSchema,
  chapters: z.array(z.object({ id, title: z.string() })),
  pages: z.array(z.object({
    id, chapterId: z.string(), name: z.string(), width: z.number().positive(), height: z.number().positive(),
    regions: z.array(comicRegionSchema), status: z.enum(['imported', 'detected', 'recognized', 'translated', 'rendered']),
    hasClean: z.boolean(), hasRendered: z.boolean(), maskStrokes: z.array(comicMaskStrokeSchema).optional(),
    revision: z.number().int().nonnegative().optional(),
  })),
  canUndo: z.boolean(), canRedo: z.boolean(),
})
export const comicMutationSchema = z
  .object({
    projectId: id,
    operationId: id,
    expectedRevision: z.number().int().nonnegative(),
    command: z.discriminatedUnion('action', [
      z
        .object({ action: z.literal('configure'), config: comicConfigSchema })
        .strict(),
      z
        .object({
          action: z.literal('savePages'),
          pages: z
            .array(
              z
                .object({
                  id,
                  regions: z.array(comicRegionSchema).max(2048),
                  maskStrokes: z
                    .array(comicMaskStrokeSchema)
                    .max(1000)
                    .optional(),
                })
                .strict(),
            )
            .min(1)
            .max(1000),
        })
        .strict(),
      z.object({ action: z.literal('undo') }).strict(),
      z.object({ action: z.literal('redo') }).strict(),
      z.object({ action: z.literal('applyProof'), jobId: id }).strict(),
    ]),
  })
  .strict()
export type ComicMutation = z.infer<typeof comicMutationSchema>
export const comicWorkflowSchema = z.enum([
  'normal',
  'visual',
  'proof',
  'erase',
  'detect',
  'ocr',
  'repair',
  'translate',
])
export type ComicWorkflow = z.infer<typeof comicWorkflowSchema>
export const comicRunSchema = z
  .object({
    projectId: id,
    expectedRevision: z.number().int().nonnegative(),
    kind: comicWorkflowSchema,
    pageIds: z.array(id).min(1).max(1000),
    regionIds: z.array(id).min(1).max(2048).optional(),
  })
  .strict()
export type ComicRunRequest = z.infer<typeof comicRunSchema>
export interface ComicTask {
  id: string
  bookId: string
  kind: ComicWorkflow
  pages: string[]
  status:
    | 'queued'
    | 'running'
    | 'pausing'
    | 'paused'
    | 'cancelling'
    | 'cancelled'
    | 'completed'
    | 'failed'
  progress: number
  createdAt: string
  changes?: { id: string; from: string; to: string }[]
  failedPageIds?: string[]
  error?: string
  stage?: string
}
export const comicTaskSchema: z.ZodType<ComicTask> = z.object({
  id, bookId: id, kind: comicWorkflowSchema, pages: z.array(id),
  status: z.enum(['queued', 'running', 'pausing', 'paused', 'cancelling', 'cancelled', 'completed', 'failed']),
  progress: z.number().min(0).max(100), createdAt: z.string(),
  changes: z.array(z.object({ id, from: z.string(), to: z.string() })).optional(),
  failedPageIds: z.array(id).optional(), error: z.string().optional(), stage: z.string().optional(),
})
export const comicImportSchema = z
  .object({
    kind: z
      .enum(['auto', 'images', 'folder', 'archive', 'pdf', 'ebook'])
      .default('auto'),
    projectId: id.optional(),
    chapterId: id.optional(),
    quick: z.boolean().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    pdfDpi: z.number().int().min(72).max(600).optional(),
    firstPage: z.number().int().positive().optional(),
    lastPage: z.number().int().positive().optional(),
    firstFrame: z.boolean().optional(),
    files: z
      .array(
        z
          .object({
            name: z.string().min(1).max(512),
            data: z.instanceof(Uint8Array),
          })
          .strict(),
      )
      .max(1000)
      .optional(),
  })
  .strict()
export type ComicImportRequest = z.infer<typeof comicImportSchema>
export const comicExportSchema = z
  .object({
    projectId: id,
    kind: z.enum(['png', 'jpg', 'images', 'cbz', 'pdf', 'json', 'labelplus']),
    pageIds: z.array(id).min(1).max(1000).optional(),
    layer: z.enum(['source', 'clean', 'rendered']).optional(),
  })
  .strict()
export type ComicExportRequest = z.infer<typeof comicExportSchema>
export interface ComicFont {
  family: string
  weight: number
  italic: boolean
}
export interface ComicBridge {
  listProjects(): Promise<ComicProjectSummary[]>
  openProject(id: string): Promise<ComicProject>
  openQuickWorkspace(): Promise<ComicProject>
  saveQuickToLibrary(id: string): Promise<ComicProject>
  importProject(request: ComicImportRequest): Promise<ComicProject | null>
  deleteProject(id: string): Promise<void>
  restoreProject(id: string): Promise<void>
  deleteProjects(ids: string[]): Promise<void>
  restoreProjects(ids: string[]): Promise<void>
  edit(request: ComicMutation): Promise<ComicProject>
  run(request: ComicRunRequest): Promise<ComicTask>
  listTasks(): Promise<ComicTask[]>
  controlTask(
    id: string,
    action: 'pause' | 'resume' | 'cancel' | 'retry',
  ): Promise<ComicTask>
  image(
    projectId: string,
    pageId: string,
    kind: 'source' | 'clean' | 'rendered',
    maxPixels?: number,
  ): Promise<string>
  thumbnail(projectId: string, pageId: string): Promise<string>
  exportProject(request: ComicExportRequest): Promise<boolean>
  listFonts(): Promise<ComicFont[]>
  readFont(family: string): Promise<string>
  onFlushRequested?(callback: () => Promise<void>): () => void
  onChanged(
    callback: (event: { projectId?: string; sequence?: number }) => void,
  ): () => void
}
