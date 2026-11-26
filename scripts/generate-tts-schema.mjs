import { build } from 'esbuild'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { z } from 'zod'

const result = await build({ entryPoints: [resolve('src/shared/tts/synthesis.ts')], bundle: true,
  platform: 'node', format: 'esm', write: false })
const contract = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
const path = resolve('engine/contracts/v2/tts.schema.json')
await mkdir(dirname(path), { recursive: true })
const schema = JSON.stringify({ schemaVersion: 1,
  synthesis: z.toJSONSchema(contract.ttsSynthesisRequestSchema),
  conditioning: z.toJSONSchema(contract.resolvedVoiceConditioningSchema),
  controls: z.toJSONSchema(contract.ttsControlsSchema), output: z.toJSONSchema(contract.ttsOutputSchema),
}, null, 2) + '\n'
if (process.argv.includes('--check')) {
  if (await readFile(path, 'utf8') !== schema) throw new Error('TTS schema is out of date')
} else await writeFile(path, schema)

const catalog = JSON.parse(await readFile(resolve('src/shared/tts/provider-voice-catalog.json'), 'utf8'))
const voicesPath = resolve('engine/nola_translator_engine/backend/gateway/preset-voices.json')
const voices = JSON.stringify({ mimo: catalog.voices.mimo.map(({ id, name, languages }) => ({ id, name, languages: languages ?? [] })) }, null, 2) + '\n'
if (process.argv.includes('--check')) {
  if (await readFile(voicesPath, 'utf8') !== voices) throw new Error('Python TTS voices are out of date')
} else await writeFile(voicesPath, voices)
