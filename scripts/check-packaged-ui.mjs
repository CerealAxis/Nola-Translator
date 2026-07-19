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
    APPDATA: process.env.FLUENTCAPTIONS_TEST_APPDATA ?? resolve('artifacts/packaged-ui-appdata'),
    ELECTRON_ENABLE_LOGGING: process.env.FLUENTCAPTIONS_DEBUG ? '1' : undefined,
  },
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function findPageTarget(overlay = false) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page'
        && target.url.includes('overlay=1') === overlay);
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
  const overlayPageProbe = await evaluate(target, `(async () => {
    const findButton = (name) => Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === name || button.getAttribute('aria-label') === name);
    findButton('外观')?.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const controls = {
      hasAdjust: Boolean(findButton('调整位置和大小')),
      hasShow: Boolean(findButton('显示浮层')),
      hasHide: Boolean(findButton('隐藏浮层'))
    };
    findButton('调整位置和大小')?.click();
    let settings;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      settings = await window.fluentCaptions.getSettings();
      if (settings.overlay.mode === 'free' && !settings.overlay.locked) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return {
      ...controls,
      mode: settings?.overlay.mode,
      locked: settings?.overlay.locked
    };
  })()`);
  const overlayTarget = await findPageTarget(true);
  await delay(250);
  const overlayWindowProbe = await evaluate(overlayTarget, `(() => {
    const overlay = document.querySelector('.standalone-overlay');
    const findButton = (name) => Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === name);
    return {
      locked: overlay?.dataset.locked,
      dragRegion: overlay ? getComputedStyle(overlay).getPropertyValue('-webkit-app-region') : '',
      hasFinish: Boolean(findButton('完成调整')),
      hasHide: Boolean(findButton('隐藏浮层')),
      hasResizeCue: Boolean(document.querySelector('.overlay-resize-cue')),
      visibility: document.visibilityState
    };
  })()`);

  if (process.env.FLUENTCAPTIONS_OVERLAY_SCREENSHOT) {
    const overlayScreenshot = await sendCommand(overlayTarget, 'Page.captureScreenshot', { format: 'png' });
    writeFileSync(process.env.FLUENTCAPTIONS_OVERLAY_SCREENSHOT, Buffer.from(overlayScreenshot.data, 'base64'));
  }

  await evaluate(overlayTarget, `(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '隐藏浮层')?.click();
    return true;
  })()`);
  await delay(150);
  const overlayHidden = await evaluate(overlayTarget, 'document.visibilityState === "hidden"');

  const failed = result.bridgeType !== 'object'
    || result.engineUnavailable
    || result.stylesheetCount === 0
    || result.firstButtonRadius === '0px'
    || /Times New Roman/i.test(result.bodyFont)
    || !bridgeProbe.ok
    || bridgeProbe.appVersion !== expectedVersion
    || !overlayPageProbe.hasAdjust
    || !overlayPageProbe.hasShow
    || !overlayPageProbe.hasHide
    || overlayPageProbe.mode !== 'free'
    || overlayPageProbe.locked !== false
    || overlayWindowProbe.locked !== 'false'
    || overlayWindowProbe.dragRegion !== 'drag'
    || !overlayWindowProbe.hasFinish
    || !overlayWindowProbe.hasHide
    || !overlayWindowProbe.hasResizeCue
    || !overlayHidden;

  console.log(JSON.stringify({ ...result, bridgeProbe, overlayPageProbe, overlayWindowProbe, overlayHidden }));
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
