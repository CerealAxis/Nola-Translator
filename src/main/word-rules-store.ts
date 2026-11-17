import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  applyWordRuleMutation,
  emptyWordRules,
  validateWordRuleIdentities,
  wordRuleMutationSchema,
  wordRulesDocumentSchema,
  type WordRuleMutation,
  type WordRulesDocument,
} from '../shared/word-rules'

const savedSchema = z
  .object({
    document: wordRulesDocumentSchema,
    operations: z.array(z.object({ id: z.string().uuid(), request: z.string() })).max(100),
  })
  .strict()
export class WordRulesStore {
  private queue: Promise<unknown> = Promise.resolve()
  private state?: z.infer<typeof savedSchema>
  constructor(
    private readonly path: string,
    private readonly changed?: (event: { revision: number; matchingRevision: number }) => void,
  ) {}
  private async load() {
    if (this.state) return this.state
    try {
      const raw = await readFile(this.path, 'utf8')
      if (Buffer.byteLength(raw) > 40 * 1024 * 1024) throw new Error('capReached')
      const state = savedSchema.parse(JSON.parse(raw))
      validateWordRuleIdentities(state.document)
      this.state = state
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      this.state = { document: emptyWordRules(), operations: [] }
    }
    return this.state
  }
  async snapshot(): Promise<WordRulesDocument> {
    await this.queue.catch(() => {})
    return structuredClone((await this.load()).document)
  }
  async flush() {
    await this.queue.catch(() => {})
  }
  command(raw: WordRuleMutation): Promise<WordRulesDocument> {
    const request = wordRuleMutationSchema.parse(raw)
    const operation = this.queue
      .catch(() => {})
      .then(async () => {
        const state = await this.load(),
          serialized = JSON.stringify(request)
        const replay = state.operations.find((item) => item.id === request.operationId)
        if (replay) {
          if (replay.request !== serialized) throw new Error('conflict')
          return structuredClone(state.document)
        }
        const document = applyWordRuleMutation(state.document, request)
        const next = {
          document,
          operations: [
            ...state.operations.slice(-99),
            { id: request.operationId, request: serialized },
          ],
        }
        await mkdir(dirname(this.path), { recursive: true })
        const temporary = `${this.path}.${randomUUID()}.tmp`
        try {
          const handle = await open(temporary, 'wx', 0o600)
          try {
            await handle.writeFile(JSON.stringify(next))
            await handle.sync()
          } finally {
            await handle.close()
          }
          await rename(temporary, this.path)
        } finally {
          await rm(temporary, { force: true }).catch(() => {})
        }
        this.state = next
        this.changed?.({ revision: document.revision, matchingRevision: document.matchingRevision })
        return structuredClone(document)
      })
    this.queue = operation
    return operation
  }
}
