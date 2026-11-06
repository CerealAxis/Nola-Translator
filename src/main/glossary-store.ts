import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { emptyGlossary, glossaryDocumentSchema, glossaryMutationSchema, type GlossaryDocument, type GlossaryMutation } from '../shared/glossary'
import { applyGlossaryMutation, validateGlossaryIdentities } from '../shared/glossary-mutation'
export { applyGlossaryMutation } from '../shared/glossary-mutation'

const savedSchema = z.object({ document: glossaryDocumentSchema, operations: z.array(z.object({ id: z.string().uuid(), request: z.string() })).max(100) }).strict()

export class GlossaryStore {
  private queue: Promise<unknown> = Promise.resolve()
  private state?: z.infer<typeof savedSchema>
  constructor(private readonly path: string, private readonly changed?: (event: { revision: number; matchingRevision: number }) => void) {}

  private async load() {
    if (this.state) return this.state
    try {
      const raw = await readFile(this.path, 'utf8')
      if (Buffer.byteLength(raw) > 40 * 1024 * 1024) throw new Error('capReached')
      const state = savedSchema.parse(JSON.parse(raw))
      validateGlossaryIdentities(state.document)
      this.state ??= state
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      this.state ??= { document: emptyGlossary(), operations: [] }
    }
    return this.state
  }
  async snapshot(): Promise<GlossaryDocument> {
    await this.queue.catch(() => {})
    return structuredClone((await this.load()).document)
  }
  command(input: GlossaryMutation): Promise<GlossaryDocument> {
    const request = glossaryMutationSchema.parse(input)
    const result = this.queue.catch(() => {}).then(async () => {
      const state = await this.load()
      const serialized = JSON.stringify(request)
      const replay = state.operations.find(operation => operation.id === request.operationId)
      if (replay) {
        if (replay.request !== serialized) throw new Error('conflict')
        return structuredClone(state.document)
      }
      const document = applyGlossaryMutation(state.document, request)
      const next = { document, operations: [...state.operations.slice(-99), { id: request.operationId, request: serialized }] }
      await mkdir(dirname(this.path), { recursive: true })
      const temporary = `${this.path}.${randomUUID()}.tmp`
      try {
        const handle = await open(temporary, 'wx', 0o600)
        try { await handle.writeFile(JSON.stringify(next)); await handle.sync() } finally { await handle.close() }
        await rename(temporary, this.path)
      } finally { await rm(temporary, { force: true }).catch(() => {}) }
      this.state = next
      this.changed?.({ revision: document.revision, matchingRevision: document.matchingRevision })
      return structuredClone(document)
    })
    this.queue = result
    return result
  }
}
