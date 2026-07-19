import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const executablePath = process.argv[2]
  ?? resolve('release/win-unpacked/FluentCaptions.exe');
const port = Number(process.env.FLUENTCAPTIONS_CDP_PORT ?? 9333);
const expectedVersion = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version;

const app = spawn(executablePath, [`--remote-debugging-port=${port}`], {
  stdio: process.env.FLUENTCAPTIONS_DEBUG ? 'inherit' : 'ignore',
  windowsHide: true,
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: process.env.FLUENTCAPTIONS_DEBUG ? '1' : undefined,
  },
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function findPageTarget() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const targets = await response.json();
      const page = targets.find((target) => (
        target.type === 'page' && !target.url.includes('overlay=1')
      ));
      if (page) {
        return page;
      }
    } catch {
      // Electron may still be starting.
    }
    await delay(100);
  }
  throw new Error('无法连接到打包应用的调试页面');
}

async function sendCommand(target, method, params = {}) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('页面检查超时')), 30_000);
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) {
        return;
      }
      clearTimeout(timeout);
      resolve(message.result);
    });
    socket.send(JSON.stringify({
      id: 1,
      method,
      params,
    }));
  });

  socket.close();
  return result;
}

async function evaluate(target, expression) {
  const result = await sendCommand(target, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result.result.value;
}

let verdict = 2;
try {
  const target = await findPageTarget();
  await delay(500);
  const result = await evaluate(target, `(() => ({
    title: document.title,
    bodyFont: getComputedStyle(document.body).fontFamily,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    firstButtonClass: document.querySelector('button')?.className ?? '',
    firstButtonPadding: document.querySelector('button') ? getComputedStyle(document.querySelector('button')).padding : '',
    firstButtonRadius: document.querySelector('button') ? getComputedStyle(document.querySelector('button')).borderRadius : '',
    bridgeType: typeof window.fluentCaptions,
    engineUnavailable: document.body.innerText.includes('引擎接口不可用'),
    stylesheetCount: document.styleSheets.length,
    href: location.href
  }))()`);
  const bridgeProbe = await evaluate(target, `(async () => {
    try {
      const [diagnostics, devices] = await Promise.all([
        window.fluentCaptions.getDiagnostics(),
        window.fluentCaptions.listDevices()
      ]);
      return {
        ok: true,
        appVersion: diagnostics['应用版本'],
        engineState: diagnostics['引擎状态'],
        deviceCount: devices.length
      };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  })()`);

  const failed = result.bridgeType !== 'object'
    || result.engineUnavailable
    || result.stylesheetCount === 0
    || result.firstButtonRadius === '0px'
    || /Times New Roman/i.test(result.bodyFont)
    || !bridgeProbe.ok
    || bridgeProbe.appVersion !== expectedVersion;

  console.log(JSON.stringify({ ...result, bridgeProbe }));
  console.log(failed ? 'PACKAGED_UI_REPRO=FAIL' : 'PACKAGED_UI_REPRO=PASS');
  if (process.env.FLUENTCAPTIONS_SCREENSHOT) {
    const screenshot = await sendCommand(target, 'Page.captureScreenshot', { format: 'png' });
    writeFileSync(process.env.FLUENTCAPTIONS_SCREENSHOT, Buffer.from(screenshot.data, 'base64'));
  }
  verdict = failed ? 1 : 0;
} catch (error) {
  console.error(error);
} finally {
  app.kill();
}

process.exitCode = verdict;
