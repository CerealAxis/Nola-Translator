import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TextProcessing } from '../../../src/main/text-processing'
import { GlossaryStore } from '../../../src/main/glossary-store'

let directory: string
let filename: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'nola-text-processing-'))
  filename = join(directory, 'text-processing.json')
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await rm(directory, { recursive: true, force: true })
})

function openSettings() {
  return new TextProcessing(filename, async () => null, () => {}, () => {})
}

it('migrates preview drafts once and requires explicit activation of existing scripts', async () => {
  const service = openSettings()
  await service.migrate({
    enabled: { normalize: true, 'python-pre': true },
    'tables:python-pre': [{ rules: [{ script: 'def POSTSOLVE(text): return text' }] }],
    'scene:screen': false,
  })
  const reopened = openSettings()
  const config = await reopened.migrate({ 'scene:screen': true })
  expect(config.values).toMatchObject({
    enabled: { normalize: true, 'python-pre': false },
    'script:python-pre': 'def POSTSOLVE(text): return text',
    'scene:screen': false,
  })
  expect(await reopened.prepare('screen', { text: 'Ａ' })).toMatchObject({ text: 'Ａ', glossary: false, protect: false })
})

it('keeps the last valid VNDB import if the remote request fails', async () => {
  const remote = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      more: false, results: [{ original: '太郎', name: 'Tarou', aliases: [] }],
    })))
    .mockResolvedValueOnce(new Response('', { status: 503 }))
  vi.stubGlobal('fetch', remote)
  const glossary = new GlossaryStore(join(directory, 'glossary.json'))
  const service = new TextProcessing(filename, async () => null, () => {}, () => {}, async library => {
    await glossary.command({ operationId: randomUUID(), expectedRevision: (await glossary.snapshot()).revision,
      command: { action: 'mergeLibrary', library } })
  })
  await service.save('options:vndb', { vndbId: '12' })
  const saved = await readFile(filename, 'utf8')
  await expect(service.save('options:vndb', { vndbId: '13' })).rejects.toThrow('vndb')
  expect(await readFile(filename, 'utf8')).toBe(saved)
  expect(service.snapshot().values['tables:replace-before']).toMatchObject([
    { name: 'VNDB v12', rules: [{ pattern: '太郎', replacement: 'Tarou' }] },
  ])
  expect((await glossary.snapshot()).libraries).toMatchObject([
    { name: 'VNDB v12', entries: [{ source: '太郎', target: 'Tarou' }] },
  ])
})
