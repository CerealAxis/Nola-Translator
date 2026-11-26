import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

const directory = resolve('artifacts/tts-relay')
await build({ entryPoints: { relay: 'src/main/tts/tts-provider-relay.ts', speech: 'src/main/astrbot-speech.ts',
  adapter: 'src/main/tts/adapters/direct-model-adapter.ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outdir: directory })
const { TtsProviderRelay } = await import(pathToFileURL(resolve(directory, 'relay.js')))
const { DirectModelTtsAdapter } = await import(pathToFileURL(resolve(directory, 'adapter.js')))
const { inferAstrBotSpeech } = await import(pathToFileURL(resolve(directory, 'speech.js')))
const wav = Buffer.alloc(76)
wav.write('RIFF'); wav.writeUInt32LE(68, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16)
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28)
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(32, 40)
let captured
const provider = createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  captured = JSON.parse(Buffer.concat(chunks).toString())
  response.writeHead(200, { 'Content-Type': 'audio/wav' }); response.end(wav)
})
await new Promise(done => provider.listen(0, '127.0.0.1', done))
const relay = new TtsProviderRelay()
try {
  const connection = { id: 'fixture', name: 'Fixture', service: 'openai-tts-api', capability: 'TTS', protocol: '', region: '', workspace: '',
    endpoint: `http://127.0.0.1:${provider.address().port}/v1`, models: [{ id: 'gpt-4o-mini-tts', name: 'Fixture', enabled: true }] }
  const adapter = new DirectModelTtsAdapter({ capabilities: async () => { throw new Error('Already resolved') },
    reference: async () => { throw new Error('No reference needed') },
    execute: (request, signal) => inferAstrBotSpeech(connection, request, 'fixture-key', signal) })
  const grant = await relay.register({ schemaVersion: 1, requestId: randomUUID(), modelBinding: 'cloud:fixture',
    providerId: 'openai-tts-api', modelId: 'gpt-4o-mini-tts', capabilityRevision: 'fixture-v1',
    voiceRef: { kind: 'preset', modelBinding: 'cloud:fixture', voiceId: 'alloy' }, conditioning: { kind: 'preset', voiceId: 'alloy' },
    targetLanguage: 'fr', text: ' ', controls: { speed: 1.1, instruct: 'Read in French' }, output: { format: 'wav' } },
  (request, signal) => adapter.synthesize(request, signal))
  const python = process.env.NOLA_TEST_PYTHON || resolve('.venv/Scripts/python.exe')
  const script = `import asyncio,os,sys,json
sys.path.insert(0,${JSON.stringify(resolve('engine'))})
from types import SimpleNamespace
from nola_translator_engine.backend.gateway.tts_relay import TtsProviderRelayAdapter
from nola_translator_engine.backend.gateway.capabilities import CallContext,Operation
from nola_translator_engine.backend.tts_contracts import SynthesisRequest
async def main():
 request=SynthesisRequest(text='Bonjour',language='fr')
 ctx=CallContext(Operation.SYNTHESIZE,'fixture',provider_options={'relay_url':os.environ['NOLA_TEST_RELAY_URL'],'relay_token':os.environ['NOLA_TEST_RELAY_TOKEN']})
 result=await TtsProviderRelayAdapter().synthesize(SimpleNamespace(),ctx,synthesis=request)
 assert result.sample_rate==24000 and len(result.chunks[0].pcm)==32
 print(json.dumps({'schemaVersion':request.schema_version,'targetLanguage':request.language,'sampleRate':result.sample_rate}))
asyncio.run(main())`
  const { stdout } = await promisify(execFile)(python, ['-c', script], { cwd: resolve('.'),
    env: { ...process.env, NOLA_TEST_RELAY_URL: grant.url, NOLA_TEST_RELAY_TOKEN: grant.token } })
  assert.deepEqual(captured, { model: 'gpt-4o-mini-tts', input: 'Bonjour', voice: 'alloy', response_format: 'wav', instructions: 'Read in French', speed: 1.1 })
  console.log(stdout.trim())
} finally {
  await relay.close()
  provider.closeAllConnections()
  await new Promise(done => provider.close(done))
}
