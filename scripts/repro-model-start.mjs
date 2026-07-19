import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import process from 'node:process';

const enginePath = process.argv[2] ?? resolve('release/win-unpacked/resources/engine/FluentCaptionsEngine.exe');
const modelDirectory = process.argv[3];
if (!modelDirectory) {
  throw new Error('用法：node scripts/repro-model-start.mjs <engine.exe> <models目录>');
}

const isPython = /python(?:\.exe)?$/i.test(enginePath);
const engine = spawn(enginePath, isPython ? ['-m', 'fluentcaptions_engine'] : [], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
  env: {
    ...process.env,
    FLUENTCAPTIONS_MODEL_DIR: modelDirectory,
    PYTHONPATH: isPython ? resolve('engine') : process.env.PYTHONPATH,
  },
});

const send = (message) => engine.stdin.write(`${JSON.stringify(message)}\n`);
const output = createInterface({ input: engine.stdout });
let verdict = 2;
let sessionId;
let finished = false;

const timeout = setTimeout(() => {
  console.error('MODEL_START_REPRO=TIMEOUT');
  engine.kill();
}, 30_000);

engine.stderr.on('data', (chunk) => process.stderr.write(chunk));
output.on('line', (line) => {
  console.log(line);
  const event = JSON.parse(line);
  if (event.type === 'ready') {
    send({ protocolVersion: 1, type: 'listResources', requestId: 'repro-resources' });
  } else if (event.type === 'resources') {
    const model = event.resources.find((item) => item.resourceId === 'sherpa-zh-en-small');
    if (!model?.installed) {
      verdict = 1;
      send({ protocolVersion: 1, type: 'shutdown', requestId: 'repro-shutdown' });
      return;
    }
    send({
      protocolVersion: 1,
      type: 'startSession',
      requestId: 'repro-start',
      config: {
        audioSource: { kind: 'defaultOutput' },
        recognitionMode: 'realtime',
        sourceLanguage: 'auto',
        targetLanguages: ['zh-CN'],
        translationProvider: 'argos',
        allowIntermediateTranslation: false,
      },
    });
  } else if (event.type === 'sessionStarted') {
    sessionId = event.sessionId;
    verdict = 0;
    send({ protocolVersion: 1, type: 'stopSession', requestId: 'repro-stop', sessionId });
  } else if (event.type === 'sessionStopped' || (event.type === 'error' && event.requestId === 'repro-start')) {
    if (event.type === 'error') verdict = 1;
    send({ protocolVersion: 1, type: 'shutdown', requestId: 'repro-shutdown' });
  } else if (event.type === 'shutdownComplete') {
    finished = true;
    clearTimeout(timeout);
    engine.stdin.end();
  }
});

engine.on('spawn', () => {
  send({ protocolVersion: 1, type: 'hello', requestId: 'repro-hello', clientVersion: '0.1.3' });
});

engine.on('close', () => {
  clearTimeout(timeout);
  console.log(verdict === 0 ? 'MODEL_START_REPRO=PASS' : verdict === 1 ? 'MODEL_START_REPRO=FAIL' : 'MODEL_START_REPRO=INCONCLUSIVE');
  process.exitCode = finished || verdict !== 2 ? verdict : 2;
});
