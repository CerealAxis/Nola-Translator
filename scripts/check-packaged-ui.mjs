/**
 * 打包产物的 UI 验收（`npm run test:packaged-ui`）。
 *
 * 与 tests/e2e 里的脚本不同，这个跑的是**已安装的正式包**（默认
 * `release/win-unpacked/Nola Translator.exe`），走 CDP 远程调试协议去问那个真实进程的页面。
 * 为什么必须用打包产物而不是 out/：asar 打包、资源内联、协议注册、preload 路径这些
 * 只有装出来才存在，dev 与 out/ 都测不到。
 *
 * ---------------------------------------------------------------------------
 * 🔴 下面四条不可删。它们是唯一防「壳子应用」的检查 —— 页面能加载、但内容全空。
 * 🔴🔴 尤其第三条：`diagnostics['应用版本']` 的键是**中文**。
 * ---------------------------------------------------------------------------
 *  1. typeof window.nolaTranslator === 'object'      桥接在不在
 *  2. document.styleSheets.length > 0                样式表在不在
 *  3. 首个 button 的 borderRadius !== '0px'          HeroUI 的样式有没有真的加载
 *  4. diagnostics['应用版本'] === package.json 的 version   版本漂移
 *
 * 第 4 条极易在重写时被"顺手改掉"：诊断对象的键是中文键
 * `应用版本`（见 `src/main/app-ipc.ts:38-48`），不是 `appVersion`、不是 `version`。
 * 改成英文键的那天，`diagnostics['应用版本']` 变成 `undefined`，`undefined !== '0.1.5'`
 * 恒为真 —— 断言还在，但它只会一直报红；反过来如果有人顺手把它改成
 * `diagnostics['应用版本'] ?? expectedVersion`，那它就永远不会报红，**版本漂移从此隐形**。
 * 要动这一行之前，先去 `src/main/app-ipc.ts` 确认键名。
 *
 * 断言方式：CHECKS 是一张**具名**检查表，每条自带自己的证据。汇总成一个巨型布尔值的老写法
 * 会让"哪一条挂了"看不出来，也让"删掉一条"看不出来 —— 具名之后，少一条会很明显。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const executablePath = process.argv[2]
  ?? resolve('release/win-unpacked/Nola Translator.exe')
const port = Number(process.env.NOLA_TRANSLATOR_CDP_PORT ?? 9333)
const expectedVersion = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version
const testAppData = process.env.NOLA_TRANSLATOR_TEST_APPDATA ?? resolve('artifacts/packaged-ui-appdata')
mkdirSync(testAppData, { recursive: true })

const app = spawn(executablePath, [`--user-data-dir=${resolve(testAppData, 'Nola Translator')}`, `--remote-debugging-port=${port}`], {
  stdio: process.env.NOLA_TRANSLATOR_DEBUG ? 'inherit' : 'ignore',
  windowsHide: true,
  env: {
    ...process.env,
    APPDATA: testAppData,
    ELECTRON_ENABLE_LOGGING: process.env.NOLA_TRANSLATOR_DEBUG ? '1' : undefined,
  },
})

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function findPageTarget(overlay = false) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`)
      const targets = await response.json()
      const page = targets.find((target) => target.type === 'page'
        && target.url.includes('overlay=1') === overlay)
      if (page) {
        return page
      }
    } catch {
      // 调试端口只在 Electron 起来之后才开，连接被拒只意味着"还没准备好"。
    }
    await delay(100)
  }
  throw new Error('无法连接到打包应用的调试页面')
}

async function sendCommand(target, method, params = {}) {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('页面检查超时')), 120_000)
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== 1) {
        return
      }
      clearTimeout(timeout)
      resolve(message.result)
    })
    socket.send(JSON.stringify({
      id: 1,
      method,
      params,
    }))
  })

  socket.close()
  return result
}

async function evaluate(target, expression) {
  const result = await sendCommand(target, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (result.exceptionDetails) {
    throw new Error(`页面表达式抛错：${result.exceptionDetails.text ?? ''}`)
  }
  return result.result.value
}

/** 等某个条件在页面里成立，等不到就返回 false（由调用方决定是不是 FAIL）。 */
const pageWait = (target, expression, attempts = 60) => (async () => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(target, `(() => { try { return Boolean(${expression}) } catch { return false } })()`)) return true
    await delay(100)
  }
  return false
})()

let verdict = 2
try {
  const target = await findPageTarget()
  await delay(500)

  // -- 主窗：壳子与内容 ---------------------------------------------------------
  const result = await evaluate(target, `(() => ({
    title: document.title,
    bodyFont: getComputedStyle(document.body).fontFamily,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    firstButtonClass: document.querySelector('button')?.className ?? '',
    firstButtonRadius: document.querySelector('button') ? getComputedStyle(document.querySelector('button')).borderRadius : '',
    bridgeType: typeof window.nolaTranslator,
    stylesheetCount: document.styleSheets.length,
    // 新 UI 的路由根节点带 data-page（src/renderer/routes.tsx）。
    routePage: document.querySelector('[data-page]')?.getAttribute('data-page') ?? '',
    shellCount: document.querySelectorAll('.nola-app-shell').length,
    titlebarCount: document.querySelectorAll('.nola-titlebar').length,
    navCount: document.querySelectorAll('.nola-sidebar-nav .nola-nav-button').length,
    mainText: (document.querySelector('.nola-main')?.innerText ?? '').trim().length,
    // ErrorBoundary 的兜底页是全应用唯一渲染 <pre> 的地方（primitives/ErrorBoundary.tsx）。
    crashText: (document.querySelector('.nola-main pre')?.textContent ?? '').slice(0, 200),
    href: location.href
  }))()`)

  const bridgeProbe = await evaluate(target, `(async () => {
    try {
      const [diagnostics, devices] = await Promise.all([
        window.nolaTranslator.getDiagnostics(),
        window.nolaTranslator.listDevices()
      ]);
      return {
        ok: true,
        // ⚠️ 中文键，见文件头第 4 条：不可改成英文，不可加 ?? 兜底。
        appVersion: diagnostics['应用版本'],
        engineState: diagnostics['引擎状态'],
        deviceCount: devices.length
      };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  })()`)

  // -- 主窗：按 hash 路由走一圈，每页都要真的画出内容 -----------------------------
  // 用 hash 而不是"按中文按钮文案点导航"：打包应用的界面语言取决于用户的设置，
  // 英文界面下那些文案一个字都对不上（上一版就是这么在英文/系统语言下空转的）。
  const routes = [
    { path: '#/', page: 'home', selector: '.nola-home', min: 1 },
    { path: '#/workspace', page: 'workspace', selector: '.nola-workspace', min: 1 },
    { path: '#/overlay', page: 'overlay', selector: '.nola-overlay-page', min: 1 },
    { path: '#/records', page: 'records', selector: '.nola-records-page, .nola-record-page', min: 1 },
    { path: '#/models', page: 'models', selector: '.models-page', min: 1 },
    { path: '#/settings/general', page: 'settings', selector: '.settings-page', min: 1 },
  ]
  const routeProbes = []
  for (const route of routes) {
    await evaluate(target, `(() => { if (location.hash !== ${JSON.stringify(route.path)}) location.hash = ${JSON.stringify(route.path)} })()`)
    const arrived = await pageWait(target, `document.querySelector('[data-page]')?.getAttribute('data-page') === ${JSON.stringify(route.page)}`)
    await delay(200)
    const probe = await evaluate(target, `(() => ({
      arrived: ${JSON.stringify(route.path)},
      onExpectedPage: document.querySelector('[data-page]')?.getAttribute('data-page') ?? '',
      content: document.querySelectorAll(${JSON.stringify(route.selector)}).length,
      // 每页都要有真正的文字，不能是画出来了但里面是空的。
      textLength: (document.querySelector('.nola-main')?.innerText ?? '').trim().length,
      crashText: (document.querySelector('.nola-main pre')?.textContent ?? '').slice(0, 200),
      activeNav: document.querySelectorAll('.nola-sidebar-nav .nola-nav-button[aria-current="page"]').length,
    }))()`)
    routeProbes.push({ ...probe, arrived, path: route.path, expectedPage: route.page, min: route.min })
  }

  // -- 主窗：设置页与翻译开关（沿用旧版的实质检查，换成新选择器） -------------------
  await evaluate(target, `(() => { location.hash = '#/settings/translation' })()`)
  await pageWait(target, `document.querySelector('[data-page]')?.getAttribute('data-page') === 'settings'`)
  await delay(250)
  /**
   * 找开关**不靠文案**：旧版找的是「翻译中间结果」，而新 UI 的标签是 `中间语言` /
   * `Pivot language`（settings.translateIntermediate）—— 按旧文案找会永远找不到。
   * 而且打包应用的界面语言取决于用户设置，按中文字面量找在英文界面下也永远找不到。
   * 这里的判据是**行为**：真的点一下，设置里的 translateIntermediate 必须跟着翻过去。
   */
  const settingsProbe = await evaluate(target, `(async () => {
    const panels = document.querySelector('.settings-panels');
    const groups = document.querySelectorAll('.settings-panels .settings-group');
    const switches = [...document.querySelectorAll('.settings-panels [role="switch"], .settings-panels input[type="checkbox"]')];
    const visible = switches.filter((el) => el.getBoundingClientRect().width > 0);
    const before = await window.nolaTranslator.getSettings().then((s) => s.translation.translateIntermediate);
    let after = before;
    if (visible[0]) {
      visible[0].click();
      for (let attempt = 0; attempt < 30; attempt += 1) {
        after = await window.nolaTranslator.getSettings().then((s) => s.translation.translateIntermediate);
        if (after !== before) break;
        await new Promise((done) => setTimeout(done, 100));
      }
      // 复原，别把测试 profile 的设置留成翻过来的。
      if (after !== before) visible[0].click();
    }
    return {
      panelCount: panels ? 1 : 0,
      groupCount: groups.length,
      switchCount: switches.length,
      visibleSwitches: visible.length,
      switchLabels: visible.map((el) => el.getAttribute('aria-label') ?? '').filter(Boolean),
      before, after, toggled: after !== before,
    };
  })()`)

  // -- 浮窗：结构、拖拽区、锁定 ---------------------------------------------------
  await evaluate(target, `(() => { location.hash = '#/overlay' })()`)
  const overlayTarget = await findPageTarget(true)
  await delay(400)
  const overlayWindowProbe = await evaluate(overlayTarget, `(() => {
    const card = document.querySelector('.nola-caption-card')
    return {
      windowCount: document.querySelectorAll('.nola-overlay-window').length,
      cardCount: document.querySelectorAll('.nola-caption-card').length,
      stageCount: document.querySelectorAll('.nola-caption-stage').length,
      sourceTrack: document.querySelectorAll('.nola-caption-track[data-kind="source"]').length,
      translationTrack: document.querySelectorAll('.nola-caption-track[data-kind="translation"]').length,
      actionButtonCount: document.querySelectorAll('.nola-caption-actions .nola-caption-action').length,
      controlsCount: document.querySelectorAll('[data-slot="overlay-controls"]').length,
      locked: card?.getAttribute('data-locked'),
      dragRegion: card ? getComputedStyle(card).getPropertyValue('-webkit-app-region') : '',
      // 旧版断言 buttonCount >= 5 且没有 .overlay-status/.overlay-edit-bar：
      // 那是"别把控制条画回主仓那套"的反向检查。新结构里控制条是 [data-slot="overlay-controls"]，
      // 动作行是 .nola-caption-actions，**没有**单独的 status / edit-bar 容器 —— 用结构断言替代，
      // 不用"某个旧类名不存在"这种会随重命名失效的反向断言。
      statusBar: document.querySelectorAll('.nola-caption-status, .overlay-status').length,
      editBar: document.querySelectorAll('.nola-caption-edit-bar, .overlay-edit-bar').length,
      visibility: document.visibilityState
    };
  })()`)

  /**
   * 旧版在这里断言"点过『调整位置和大小』之后 mode === 'free' 且 locked === false"。
   * 新 UI 没有 free 模式（mode 只有 top/bottom），等价的能力是**锁定开关**：
   * 解锁 → data-locked 变 false → 整块卡片成为 -webkit-app-region: drag，且改动要落进设置。
   *
   * 怎么认出"哪一颗是锁"：**不能按 aria-label**（文案随界面语言变，中英文各一套），
   * **也不能按 DOM 次序**（位置/锁定/置顶三颗都是 aria-pressed 开关，按次序找就是按位置找）。
   * 唯一与语言、次序都无关的判据是**效果**：三颗里只有锁那颗会改 `data-locked`。
   * 试过的其余开关都点回去，别把测试 profile 的设置留成翻过来的。
   */
  const unlockProbe = await evaluate(overlayTarget, `(async () => {
    const cardOf = () => document.querySelector('.nola-caption-card');
    const toggles = () => [...document.querySelectorAll('.nola-caption-actions .nola-caption-action')]
      .filter((el) => el.getAttribute('aria-pressed') !== null);
    const readCard = () => {
      const card = cardOf();
      return {
        locked: card?.getAttribute('data-locked'),
        dragRegion: card ? getComputedStyle(card).getPropertyValue('-webkit-app-region') : '',
      };
    };
    const before = readCard();
    let lockButton = null;
    const tried = [];
    for (const button of toggles()) {
      const observed = cardOf()?.getAttribute('data-locked');
      button.click();
      tried.push(button);
      let changed = false;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (cardOf()?.getAttribute('data-locked') !== observed) { changed = true; break }
        await new Promise((done) => setTimeout(done, 60));
      }
      if (changed) { lockButton = button; break }
    }
    for (const button of tried) if (button !== lockButton) button.click();
    if (!lockButton) return { clicked: false, before, after: readCard(), settingsLocked: null };
    const after = readCard();
    let settingsLocked = null;
    try { settingsLocked = (await window.nolaTranslator.getSettings()).overlay.locked } catch { settingsLocked = 'threw' }
    lockButton.click();
    await new Promise((done) => setTimeout(done, 400));
    return { clicked: true, before, after, settingsLocked, restored: readCard(), label: lockButton.getAttribute('aria-label') };
  })()`)

  if (process.env.NOLA_TRANSLATOR_OVERLAY_SCREENSHOT) {
    const overlayScreenshot = await sendCommand(overlayTarget, 'Page.captureScreenshot', { format: 'png' })
    writeFileSync(process.env.NOLA_TRANSLATOR_OVERLAY_SCREENSHOT, Buffer.from(overlayScreenshot.data, 'base64'))
  }

  await evaluate(target, 'window.nolaTranslator.hideOverlay()')
  await delay(150)
  const overlayHidden = await evaluate(overlayTarget, 'document.visibilityState === "hidden"')
  await evaluate(target, `(async () => {
    await window.nolaTranslator.updateSettings({ overlay: { backgroundOpacity: 0, locked: true } });
    await window.nolaTranslator.showOverlay();
    await new Promise((resolve) => setTimeout(resolve, 150));
    return true;
  })()`)
  const transparentOverlayProbe = await evaluate(overlayTarget, `(() => {
    const card = document.querySelector('.nola-caption-card');
    const styles = card ? getComputedStyle(card) : null;
    return {
      cardCount: card ? 1 : 0,
      visible: document.visibilityState === 'visible',
      transparentFlag: card?.getAttribute('data-transparent'),
      backgroundColor: styles?.backgroundColor,
      backdropFilter: styles?.backdropFilter,
      boxShadow: styles?.boxShadow,
    };
  })()`)

  // -- 具名检查表 ---------------------------------------------------------------
  // 每条自带证据：多一条少一条都看得见，也不会像巨型布尔值那样"挂了就不知道挂哪"。
  const CHECKS = [
    // —— 不可删的四条（壳子应用防线）——
    ['bridge-object', result.bridgeType === 'object', { bridgeType: result.bridgeType }],
    ['stylesheet-loaded', result.stylesheetCount > 0, { stylesheetCount: result.stylesheetCount }],
    ['first-button-rounded', Boolean(result.firstButtonRadius) && result.firstButtonRadius !== '0px', { firstButtonRadius: result.firstButtonRadius }],
    // ⚠️ 中文键 '应用版本'，见文件头第 4 条
    ['app-version-matches-package', bridgeProbe.ok && bridgeProbe.appVersion === expectedVersion, { appVersion: bridgeProbe.appVersion, expectedVersion, ok: bridgeProbe.ok }],

    // —— 主窗：不是壳子、没崩、字体对 ——
    ['no-error-boundary', result.crashText === '' && routeProbes.every((p) => p.crashText === ''), { crashText: result.crashText }],
    ['shell-rendered', result.shellCount === 1 && result.titlebarCount >= 1, { shellCount: result.shellCount, titlebarCount: result.titlebarCount }],
    ['six-nav-items', result.navCount === 6, { navCount: result.navCount }],
    ['main-has-content', result.mainText > 40, { mainText: result.mainText }],
    ['not-times-new-roman', !/Times New Roman/i.test(result.bodyFont), { bodyFont: result.bodyFont }],

    // —— 每条路由都真的画出了内容 ——
    ...routeProbes.flatMap((probe) => [
      [`route-arrives:${probe.path}`, probe.arrived && probe.onExpectedPage === probe.expectedPage, { onExpectedPage: probe.onExpectedPage, arrived: probe.arrived }],
      [`route-has-content:${probe.path}`, probe.content >= probe.min && probe.textLength > 40, { content: probe.content, need: probe.min, textLength: probe.textLength }],
      // 侧边栏必须跟着路由高亮，且**恰好一个** active —— 零个说明导航没接上，两个说明高亮坏了。
      [`route-nav-highlight:${probe.path}`, probe.activeNav === 1, { activeNav: probe.activeNav }],
    ]),

    // —— 设置页 ——
    ['settings-panel-rendered', settingsProbe.panelCount === 1 && settingsProbe.groupCount >= 1, settingsProbe],
    ['settings-switches-visible', settingsProbe.switchCount >= 1 && settingsProbe.visibleSwitches >= 1, settingsProbe],
    // 开关必须真的把设置写下去：只画出来、点了不落盘，那是个装饰。
    ['settings-switch-writes-through', settingsProbe.toggled, { before: settingsProbe.before, after: settingsProbe.after }],

    // —— 浮窗 ——
    ['overlay-structure', overlayWindowProbe.windowCount === 1 && overlayWindowProbe.cardCount === 1 && overlayWindowProbe.stageCount === 1, overlayWindowProbe],
    ['overlay-two-tracks', overlayWindowProbe.sourceTrack === 1 && overlayWindowProbe.translationTrack === 1, { sourceTrack: overlayWindowProbe.sourceTrack, translationTrack: overlayWindowProbe.translationTrack }],
    ['overlay-action-buttons', overlayWindowProbe.actionButtonCount >= 6, { actionButtonCount: overlayWindowProbe.actionButtonCount }],
    ['overlay-controls-present', overlayWindowProbe.controlsCount === 1, { controlsCount: overlayWindowProbe.controlsCount }],
    ['overlay-no-stale-panels', overlayWindowProbe.statusBar === 0 && overlayWindowProbe.editBar === 0, { statusBar: overlayWindowProbe.statusBar, editBar: overlayWindowProbe.editBar }],
    // 解锁后 data-locked 变 false、整块卡片成为拖拽区，而且这个改动落进了设置。
    // 三条一起才说明"锁定"这个能力真的存在且真的接通了。
    ['overlay-unlock-drags', unlockProbe.clicked && unlockProbe.after.locked === 'false' && unlockProbe.after.dragRegion === 'drag', unlockProbe],
    ['overlay-unlock-persisted', unlockProbe.settingsLocked === false, { settingsLocked: unlockProbe.settingsLocked }],
    // 试出来的其它开关（位置/置顶）必须被点回去：没复原就是脚本在改用户的设置。
    ['overlay-restored', unlockProbe.restored?.locked === unlockProbe.before.locked, { before: unlockProbe.before, restored: unlockProbe.restored }],

    // —— 浮窗可见性与透明背景（与视觉正确性直接相关，尽量保留）——
    ['overlay-hides', Boolean(overlayHidden), { overlayHidden }],
    ['overlay-shows-transparent', transparentOverlayProbe.visible && transparentOverlayProbe.cardCount === 1, transparentOverlayProbe],
    ['overlay-transparent-flag', transparentOverlayProbe.transparentFlag === 'true', { transparentFlag: transparentOverlayProbe.transparentFlag }],
    ['overlay-background-clear', transparentOverlayProbe.backgroundColor === 'rgba(0, 0, 0, 0)', { backgroundColor: transparentOverlayProbe.backgroundColor }],
    ['overlay-no-backdrop-filter', transparentOverlayProbe.backdropFilter === 'none', { backdropFilter: transparentOverlayProbe.backdropFilter }],
    ['overlay-no-box-shadow', transparentOverlayProbe.boxShadow === 'none', { boxShadow: transparentOverlayProbe.boxShadow }],
  ]

  const failed = CHECKS.filter(([, ok]) => !ok)
  console.log(JSON.stringify({ total: CHECKS.length, failed: failed.length, checks: Object.fromEntries(CHECKS) }, null, 2))
  console.log(failed.length ? 'PACKAGED_UI_REPRO=FAIL' : 'PACKAGED_UI_REPRO=PASS')
  if (process.env.NOLA_TRANSLATOR_SCREENSHOT) {
    const screenshot = await sendCommand(target, 'Page.captureScreenshot', { format: 'png' })
    writeFileSync(process.env.NOLA_TRANSLATOR_SCREENSHOT, Buffer.from(screenshot.data, 'base64'))
  }
  verdict = failed.length ? 1 : 0;
} catch (error) {
  console.error(error);
} finally {
  app.kill();
}

process.exitCode = verdict;
