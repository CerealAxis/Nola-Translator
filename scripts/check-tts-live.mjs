import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'

if (process.env.NOLA_TTS_LIVE !== '1' || !process.argv[2]) {
  console.error('Set NOLA_TTS_LIVE=1 and provide a JSON fixture path. Each fixture makes one billable synthesis request and may upload its reference recording.')
  process.exit(2)
}
const fixtures = JSON.parse(await readFile(resolve(process.argv[2]), 'utf8'))
if (!Array.isArray(fixtures) || !fixtures.length || fixtures.length > 20) throw new Error('Expected 1–20 live fixtures')
const directory = resolve('artifacts/tts-live')
await mkdir(directory, { recursive: true })
await build({ entryPoints: { adapter: 'src/main/astrbot-speech.ts', assets: 'src/main/tts/voice-assets.ts' }, bundle: true,
  platform: 'node', format: 'esm', packages: 'external', outdir: directory })
const { inferAstrBotSpeech } = await import(pathToFileURL(resolve(directory, 'adapter.js')))
const { inspectVoiceAudio } = await import(pathToFileURL(resolve(directory, 'assets.js')))
const results = []
for (const [index, fixture] of fixtures.entries()) {
  const modelId = fixture.modelId
  if (typeof fixture.keyEnv !== 'string' || !process.env[fixture.keyEnv]) throw new Error(`Missing credential environment for fixture ${index}`)
  if (typeof fixture.text !== 'string' || !fixture.text.trim() || fixture.text.length > 200) throw new Error(`Fixture ${index} text must contain 1–200 characters`)
  let conditioning, audio
  if (fixture.referencePath) {
    const data = await readFile(resolve(fixture.referencePath))
    const format = inspectVoiceAudio(data)
    if (data.length > 32 * 1024 * 1024) throw new Error(`Fixture ${index} reference exceeds 32 MiB`)
    audio = `data:${format.mime};base64,${data.toString('base64')}`
    conditioning = { kind: 'reference-audio', assetId: 'live-reference', sha256: createHash('sha256').update(data).digest('hex'),
      purpose: 'human-reference', transcript: fixture.transcript }
  } else if (fixture.description) conditioning = { kind: 'design', description: fixture.description, recipe: {},
    recipeSchema: 'nola-description-v1', authoringModelBinding: 'cloud:live' }
  else conditioning = fixture.voiceId ? { kind: 'preset', voiceId: fixture.voiceId } : { kind: 'engine-default' }
  const connection = { id: 'live', service: fixture.providerId, capability: 'TTS', name: 'Live fixture', endpoint: fixture.endpoint ?? '',
    protocol: '', region: fixture.region ?? '', workspace: fixture.workspace ?? '', options: fixture.options,
    models: [{ id: modelId, name: modelId, enabled: true }] }
  const start = performance.now()
  try {
    const result = await inferAstrBotSpeech(connection, { id: randomUUID(), kind: 'tts', model: 'cloud:live',
      text: fixture.text, target: fixture.targetLanguage, conditioning, audio, output: { format: fixture.format ?? 'wav' } },
    process.env[fixture.keyEnv], AbortSignal.timeout(120_000))
    const data = Buffer.from(result.audio.split(',', 2)[1], 'base64')
    const format = inspectVoiceAudio(data)
    await writeFile(resolve(directory, `${index}.${format.extension}`), data)
    results.push({ index, provider: fixture.providerId, modelId, state: 'passed', bytes: data.length,
      durationMs: format.durationMs, elapsedMs: Math.round(performance.now() - start) })
  } catch (error) {
    results.push({ index, provider: fixture.providerId, modelId, state: 'failed', code: error.code ?? error.name })
  }
}
await writeFile(resolve(directory, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2))
console.log(JSON.stringify(results))
if (results.some(result => result.state !== 'passed')) process.exitCode = 1
