import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const output = resolve('artifacts/assistant-ui')
const self = fileURLToPath(import.meta.url)
const pause = ms => new Promise(done => setTimeout(done, ms))

if (!process.versions.electron) {
  const { build } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const { default: tailwind } = await import('@tailwindcss/vite')
  if (!process.argv.includes('--skip-build')) await build({ configFile: false, root: resolve('tests/e2e/fixtures'), base: './', plugins: [react(), tailwind()],
    resolve: { alias: { '@': resolve('src/renderer'), '@renderer': resolve('src/renderer') } },
    build: { target: 'esnext', rollupOptions: { input: resolve('tests/e2e/fixtures/workbench-shell.html') }, outDir: resolve(output, 'renderer'), emptyOutDir: true, minify: false, chunkSizeWarningLimit: 5000 } })
  await writeFile(resolve(output, 'renderer/index.html'), await readFile(resolve(output, 'renderer/workbench-shell.html')))
  const { build: bundle } = await import('esbuild')
  await bundle({ stdin: { contents: `export { registerWorkbench } from './src/main/workbench';
    export { createGatewayLanguageModel } from './src/main/gateway-language-model';`, resolveDir: process.cwd() },
  bundle: true, packages: 'external', platform: 'node', format: 'esm', external: ['electron'], outfile: resolve(output, 'window.mjs') })
  const { default: electron } = await import('electron')
  const childEnv = { ...process.env }; delete childEnv.ELECTRON_RUN_AS_NODE
  const child = spawn(electron, [self, ...process.argv.slice(2)], { stdio: 'inherit', env: childEnv })
  process.exitCode = await new Promise(done => child.on('exit', code => done(code ?? 1)))
} else {
  const { app, BrowserWindow, ipcMain } = await import('electron')
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  const errors = []
  async function run() {
    const { build } = await import('esbuild')
    const defaultsBundle = await build({ entryPoints: ['src/shared/settings.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
    const { DEFAULT_SETTINGS } = await import('data:text/javascript;base64,' + Buffer.from(defaultsBundle.outputFiles[0].text).toString('base64'))
    let settings = { ...structuredClone(DEFAULT_SETTINGS), theme: 'light', uiLanguage: 'zh-CN' }
    const resources = []
    const services = {}
    settings.recognition.modelId = 'qwen3-asr-1.7b-crisp-q4-k'
    settings.translation.localModelId = 'index-translate-2b-q4-k-m'
    settings.synthesis = { modelId: 'hub:voice/custom', voice: 'default-fixture-voice' }
    settings.translation.customModels = [{ id: 'existing', name: 'Existing language model', endpoint: 'http://fixture.invalid/v1', model: 'existing-model', apiFormat: 'chat-completions', contextWindow: 4096, maxOutputTokens: 256, languages: ['zh', 'en'] }]
    for (const [resourceId, kind, name, installed] of [
      ['qwen3-asr-1.7b-crisp-q4-k', 'recognitionModel', 'Installed Qwen3-ASR Q4_K', true],
      ['index-translate-2b-q4-k-m', 'translationModel', 'Installed Index Translate Q4_K_M', true],
      ['hub:voice/custom', 'ttsModel', 'Installed custom TTS', true],
      ['not-installed', 'recognitionModel', 'Uninstalled model', false],
    ]) resources.push({ resourceId, kind, name, installed, provider: 'fixture', description: '', languages: ['zh', 'en'], installedBytes: 1, state: 'idle', cancellable: false })
    // 模拟模型网关已加载的能力，以及工作台会话选中的已配置模型。
    const defaults = {
      asr: 'resource:qwen3-asr-1.7b-crisp-q4-k',
      mt: 'resource:index-translate-2b-q4-k-m',
      tts: 'resource:hub:voice/custom',
      llm: 'custom:existing',
    }
    settings.modelPolicy = {
      enabled: Object.fromEntries(Object.entries(defaults).map(([kind, model]) => [`${kind}:${model}`, true])),
      defaults,
      selections: defaults,
    }
    for (const [kind, model] of Object.entries(defaults)) {
      if (model.startsWith('resource:')) services[kind] = { state: 'ready', model, name: '' }
    }
    ipcMain.handle('fixture:settings', () => settings)
    ipcMain.handle('fixture:resources', () => ({ storagePath: '', resources }))
    ipcMain.handle('fixture:gateway', () => ({ state: 'running', services }))
    let mainPage = ''
    let terminalExecutions = 0
    const wavFixture = Buffer.alloc(44 + 3200)
    wavFixture.write('RIFF', 0); wavFixture.writeUInt32LE(wavFixture.length - 8, 4); wavFixture.write('WAVEfmt ', 8)
    wavFixture.writeUInt32LE(16, 16); wavFixture.writeUInt16LE(1, 20); wavFixture.writeUInt16LE(1, 22)
    wavFixture.writeUInt32LE(16000, 24); wavFixture.writeUInt32LE(32000, 28); wavFixture.writeUInt16LE(2, 32); wavFixture.writeUInt16LE(16, 34)
    wavFixture.write('data', 36); wavFixture.writeUInt32LE(3200, 40)
    const fixtureAudio = 'data:audio/wav;base64,' + wavFixture.toString('base64')
    ipcMain.handle('fixture:terminal-count', () => terminalExecutions)
    ipcMain.handle('fixture:direct-model', async (_, request) => {
      if (request.kind === 'mt') { await pause(1200); return { text: 'Fixture translation result' } }
      if (request.kind === 'tts') { await pause(1200); return { text: '', audio: fixtureAudio } }
      assert.equal(request.kind, 'asr')
      assert.ok(request.audio.startsWith('data:audio/wav;base64,'))
      const wav = Buffer.from(request.audio.split(',')[1], 'base64')
      assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
      assert.equal(wav.readUInt32LE(24), 16000)
      await pause(1200)
      return { text: request.text.includes('empty') ? '' : 'Fixture video transcript' }
    })
    ipcMain.handle('fixture:main-page', (_, path) => { mainPage = path })
    ipcMain.handle('fixture:update', (event, patch) => {
      const next = { ...settings, ...patch }
      for (const key of Object.keys(patch)) {
        if (patch[key] && typeof patch[key] === 'object' && !Array.isArray(patch[key])) next[key] = { ...settings[key], ...patch[key] }
      }
      settings = next
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('fixture:settings-changed', settings))
      return settings
    })
    const preload = resolve(output, 'preload.cjs')
    await writeFile(preload, `const {contextBridge,ipcRenderer}=require('electron');const chunks=[];contextBridge.exposeInMainWorld('nolaTranslator',{
      fixtureChunks:()=>chunks.join(''),
      fixtureTerminalCount:()=>ipcRenderer.invoke('fixture:terminal-count'),
      isWindows:true,getSettings:()=>ipcRenderer.invoke('fixture:settings'),updateSettings:p=>ipcRenderer.invoke('fixture:update',p),
      onSettingsChanged:fn=>{const cb=(_,s)=>fn(s);ipcRenderer.on('fixture:settings-changed',cb);return()=>ipcRenderer.removeListener('fixture:settings-changed',cb)},
      onOverlayMenuChanged:()=>()=>{},onOverlayLockChanged:()=>()=>{},onEngineEvent:()=>()=>{},onOpenAppearance:()=>()=>{},
      listResources:()=>ipcRenderer.invoke('fixture:resources'),
      hasTranslationCredential:async slot=>slot==='cloud-model:existing',
      gateway:{snapshot:()=>ipcRenderer.invoke('fixture:gateway'),onChanged:()=>()=>{}},
      streamLanguageModel:request=>ipcRenderer.invoke('app:language-model:stream',request),
      resolveLanguageModelAudio:result=>ipcRenderer.invoke('app:language-model:audio-result',result),
      directModel:request=>ipcRenderer.invoke('fixture:direct-model',request),
      agentWorkspace:action=>ipcRenderer.invoke('app:agent-workspace',action),
      cancelLanguageModel:id=>{chunks.push('CANCEL:'+id);return ipcRenderer.invoke('app:language-model:cancel',id)},
      onLanguageModelStream:fn=>{const cb=(_,data)=>{chunks.push(data.chunk);fn(data)};ipcRenderer.on('app:language-model:chunk',cb);return()=>ipcRenderer.removeListener('app:language-model:chunk',cb)},
      openMainPage:path=>ipcRenderer.invoke('fixture:main-page',path),
      isMainWindowMaximized:async()=>false,onMainWindowMaximizedChanged:()=>()=>{},
      minimizeMainWindow:async()=>{},toggleMainWindowMaximize:async()=>false,closeMainWindow:async()=>{},
    });`)
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost')
        if (url.pathname === '/anthropic/v1/messages') {
          let body = ''; for await (const chunk of req) body += chunk
          const request = JSON.parse(body)
          assert.equal(request.stream, true)
          res.writeHead(200, { 'Content-Type': 'text/event-stream' })
          const event = data => res.write(`data: ${JSON.stringify(data)}\n\n`)
          event({ type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: 'existing-model', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 125, output_tokens: 0 } } })
          event({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } })
          event({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Native reasoning stream' } })
          await pause(JSON.stringify(request.messages.at(-1)).includes('Keep generating') ? 4500 : 500)
          event({ type: 'content_block_stop', index: 0 })
          const last = request.messages.at(-1)
          const present = JSON.stringify(last).includes('Show widget') && !JSON.stringify(last).includes('tool_result')
          const plan = JSON.stringify(last).includes('Plan native task') && !JSON.stringify(last).includes('tool_result')
          const terminal = JSON.stringify(last).includes('Run approved command') && !JSON.stringify(last).includes('tool_result')
          const nativeModelTool = !JSON.stringify(last).includes('tool_result') && (JSON.stringify(last).includes('Use default translation') ? 'translate_text'
            : JSON.stringify(last).includes('Use default speech') ? 'synthesize_speech' : JSON.stringify(last).includes('Use default recognition') ? 'recognize_audio' : '')
          if (present || plan || terminal || nativeModelTool) {
            const toolName = nativeModelTool || (terminal ? 'terminal' : plan ? 'update_plan' : 'present')
            assert.ok(request.tools.some(tool => tool.name === toolName))
            if (nativeModelTool) assert.ok(!('model' in request.tools.find(tool => tool.name === nativeModelTool).input_schema.properties))
            event({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } })
            event({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: plan ? 'Updating native execution plan.' : 'Preparing native generated UI.' } })
            event({ type: 'content_block_stop', index: 1 })
            event({ type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: nativeModelTool ? `fixture-${nativeModelTool}` : terminal ? 'fixture-terminal' : plan ? 'fixture-plan' : 'fixture-present', name: toolName, input: {} } })
            event({ type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: JSON.stringify(nativeModelTool === 'translate_text' ? { text: 'Hello', source: 'en', target: 'zh' }
              : nativeModelTool === 'synthesize_speech' ? { text: 'Hello', voice: '' } : nativeModelTool === 'recognize_audio' ? { attachment: 0, path: null, language: 'auto' }
                : terminal ? { command: 'echo native approval' } : plan ? { title: 'Native execution plan', steps: ['Inspect configuration', 'Verify native UI'], activeIndex: 1 } : { _type: 'Text', value: 'Native generated UI' }) } })
          } else {
            event({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } })
            event({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: JSON.stringify(last).includes('tool_result') ? 'Native widget completed' : 'Native streamed answer' } })
          }
          event({ type: 'content_block_stop', index: present || plan || terminal || nativeModelTool ? 2 : 1 })
          event({ type: 'message_delta', delta: { stop_reason: present || plan || terminal || nativeModelTool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 25 } })
          event({ type: 'message_stop' }); res.end(); return
        }
        if (url.pathname === '/host') { res.end('<html><body>window fixture</body></html>'); return }
        const path = resolve(output, 'renderer', '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)))
        assert.ok(path.startsWith(resolve(output, 'renderer') + '\\'))
        const data = await readFile(path)
        res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream')
        res.setHeader('Accept-Ranges', 'bytes')
        const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '')
        if (range) {
          const start = Number(range[1]); const end = range[2] ? Number(range[2]) : data.length - 1
          res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 }); res.end(data.subarray(start, end + 1))
        } else { res.setHeader('Content-Length', data.length); res.end(data) }
      } catch { res.statusCode = 404; res.end() }
    })
    await new Promise(done => server.listen(0, '127.0.0.1', done))
    const origin = `http://127.0.0.1:${server.address().port}`
    settings.translation.customModels[0].endpoint = origin + '/anthropic'
    settings.translation.customModels[0].apiFormat = 'anthropic'
    if (process.argv.includes('--production')) delete process.env.ELECTRON_RENDERER_URL
    else process.env.ELECTRON_RENDERER_URL = origin
    const fixtureProject = { id: 'c29b359b-c948-40b2-99ed-6143e9243fd4', name: 'Fixture project', path: 'C:/fixture' }
    const workspaceSnapshot = { projects: [fixtureProject], selectedProject: fixtureProject.id, skills: [], subagents: [], activity: [], sandbox: { available: false, backend: 'fixture', reason: 'fixture isolation disabled' } }
    const workspace = { project: async () => workspaceSnapshot.selectedProject ? fixtureProject : undefined, skills: async () => [], definitions: async () => workspaceSnapshot.subagents, canUseTerminal: async () => !!workspaceSnapshot.selectedProject,
      terminal: async () => { terminalExecutions++; return JSON.stringify({ exitCode: 0, output: 'Native approved terminal output' }) },
      action: async action => { if (action.action === 'subagent') workspaceSnapshot.subagents = [...workspaceSnapshot.subagents.filter(item => item.id !== action.agent.id), action.agent]; if (action.action === 'selectProject') workspaceSnapshot.selectedProject = action.id; return workspaceSnapshot } }
    const { registerWorkbench, createGatewayLanguageModel } = await import(pathToFileURL(resolve(output, 'window.mjs')).href)
    const modelSettings = { getSettings: () => settings, getCredential: async () => 'fixture-secret' }
    const win = new BrowserWindow({ width: 1180, height: 780, show: false, frame: false,
      webPreferences: { preload, offscreen: true, backgroundThrottling: false, partition: 'workbench-fixture' } })
    win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
    win.webContents.on('render-process-gone', (_, details) => errors.push(JSON.stringify(details)))
    const workbench = registerWorkbench(() => win, resolve(output, 'main'), { ...modelSettings, workspace,
      acquireLanguageModel: async binding => {
        const { signal } = new AbortController()
        const model = await createGatewayLanguageModel(modelSettings, binding, signal)
        return { ...model, signal, release: () => { void model.close() } }
      },
      inferModel: async (request, signal) => {
        if (request.kind === 'asr') assert.ok(request.audio?.startsWith('data:audio/wav;base64,'))
        await pause(800)
        signal.throwIfAborted()
        return request.kind === 'tts' ? { text: '', audio: fixtureAudio, voices: ['default-fixture-voice'] }
          : { text: request.kind === 'asr' ? 'Default ASR tool transcript' : 'Default MT tool translation' }
      } })
    if (process.argv.includes('--production')) {
      // Seed the former file document to verify Electron's existing storage survives the move.
      const legacy = resolve(output, 'renderer/workbench.html')
      await writeFile(legacy, '<!doctype html><html><body>Legacy workbench storage fixture</body></html>')
      await win.loadFile(legacy)
      const prefix = `nola.local-call:project:${fixtureProject.id}:`
      const format = 'ai-sdk/v6'
      const legacyEntry = { id: 'legacy-user', parent_id: null, format,
        content: { role: 'user', parts: [{ type: 'text', text: 'Message saved by the old workbench' }] } }
      const legacyItems = [{ remoteId: 'legacy-thread', status: 'regular', title: 'Legacy saved conversation', formats: [format] }]
      const legacyMessagesKey = prefix + 'formatted-messages:' + JSON.stringify(['legacy-thread', format])
      await win.webContents.executeJavaScript(`localStorage.setItem(${JSON.stringify(prefix + 'threads')}, ${JSON.stringify(JSON.stringify(legacyItems))}); localStorage.setItem(${JSON.stringify(legacyMessagesKey)}, ${JSON.stringify(JSON.stringify({ messages: [legacyEntry] }))})`)
      await win.loadFile(resolve(output, 'renderer/index.html'), { hash: '/workbench' })
    } else await win.loadURL(origin + '/index.html#/workbench')
    const evaluate = code => win.webContents.executeJavaScript(code, true).catch(error => { console.error('Evaluation failed:', code, errors); throw error })
    const waitFor = async code => {
      for (let i = 0; i < 100; i++) { if (await evaluate(code)) return; await pause(100) }
      throw new Error(`Timeout: ${code}\n${await evaluate('document.body.textContent')}\n${errors.join('\n')}\n${await evaluate('window.nolaTranslator.fixtureChunks()')}`)
    }
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
    const input = (selector, text) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`)
    const type = async text => {
      await evaluate(`document.querySelector('.aui-composer-input').focus()`); await win.webContents.insertText(text)
      await waitFor(`!document.querySelector('.aui-composer-send').disabled`)
    }
    const send = async text => {
      const count = await evaluate(`document.querySelectorAll('[data-role="assistant"]').length`)
      await type(text); await click('.aui-composer-send')
      await waitFor(`document.querySelectorAll('[data-role="assistant"]').length>${count} && !document.querySelector('.aui-composer-cancel')`)
    }
    const screenshot = async name => {
      await pause(250)
      const dimensions = await evaluate(`({width:innerWidth,height:innerHeight,body:document.body.scrollWidth,root:document.querySelector('.native-agent-app').scrollWidth})`)
      assert.ok(dimensions.root <= dimensions.width + 1, JSON.stringify(dimensions))
      await writeFile(resolve(output, `${name}.png`), (await win.webContents.capturePage()).toPNG())
    }
    const assertSelectionContrast = async () => {
      const contrast = await evaluate(`(()=>{
        const row=document.querySelector('.nola-workbench-sidebar .nola-nav-button[data-active="true"]');
        if(!row) return 0;
        const context=document.createElement('canvas').getContext('2d');
        const luminance=color=>{context.fillStyle=color;context.fillRect(0,0,1,1);const rgb=[...context.getImageData(0,0,1,1).data].slice(0,3).map(value=>{const s=value/255;return s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4;});return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;};
        const background=luminance(getComputedStyle(row).backgroundColor);
        const foreground=luminance(getComputedStyle(row).color);
        return (Math.max(background,foreground)+0.05)/(Math.min(background,foreground)+0.05);
      })()`)
      assert.ok(contrast >= 4.5, `Selected conversation contrast: ${contrast}`)
    }
    await waitFor(`!!document.querySelector('.aui-composer-input')`)
    if (process.argv.includes('--production')) {
      await waitFor(`!![...document.querySelectorAll('aside button')].find(el=>el.innerText==='Legacy saved conversation')`)
      await evaluate(`[...document.querySelectorAll('aside button')].find(el=>el.innerText==='Legacy saved conversation').click()`)
      await waitFor(`document.querySelector('[data-testid="native-conversation"]').textContent.includes('Message saved by the old workbench')`)
      await screenshot('legacy-conversation-restored')
      await evaluate(`[...document.querySelectorAll('aside button')].find(el=>el.innerText.includes('新建对话')).click()`)
      await waitFor(`document.querySelectorAll('[data-role="user"]').length===0`)
    }
    assert.equal(await evaluate(`document.documentElement.classList.contains('native-agent-document')`), false)
    assert.equal(BrowserWindow.getAllWindows().length, 1)
    assert.equal(await evaluate(`document.querySelectorAll('.nola-titlebar').length`), 1)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-slot="composer-bar"]')).backdropFilter`), 'none')
    await waitFor(`document.querySelector('[data-testid="native-composer"] [data-slot="composer-model-trigger"]').innerText.includes('Existing language model')`)
    assert.ok(await evaluate(`!!document.querySelector('[data-testid="native-agent-app"]')`))
    const mutedColors = await evaluate(`(()=>{
      const surface=document.createElement('div');surface.className='bg-muted text-muted';surface.textContent='token check';document.body.append(surface);
      const probe=document.createElement('div');probe.style.cssText='background:var(--muted);color:var(--muted-foreground)';document.body.append(probe);
      const a=getComputedStyle(surface), b=getComputedStyle(probe);const result={actual:[a.backgroundColor,a.color],expected:[b.backgroundColor,b.color]};
      surface.remove();probe.remove();return result;
    })()`)
    assert.deepEqual(mutedColors.actual, mutedColors.expected, 'Muted surfaces and legacy muted text must resolve to separate semantic colors')
    await screenshot('welcome-aligned-light')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-slot="composer-bar"]')).padding`), '12px')
    assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('[data-slot="composer-bar"]')).boxShadow`), 'none', 'Composer keeps its paper boundary without global glass overrides')
    assert.ok(await evaluate(`!!document.querySelector('[data-slot="composer-voice-button"]')`))
    await type('Hello')
    await click('.aui-composer-send')
    await waitFor(`document.body.innerText.includes('Native reasoning stream')`)
    await waitFor(`document.body.innerText.includes('Native streamed answer') && !document.querySelector('.aui-composer-cancel')`)
    await waitFor(`document.querySelector('[data-slot="composer-context"]').textContent.includes('0.15')`)
    await screenshot('embedded-welcome-light')
    await input('.nola-workbench-sidebar input[type="search"]', 'no-matching-conversation')
    await waitFor(`document.querySelectorAll('.nola-workbench-thread').length===0`)
    assert.equal(await evaluate(`!!document.querySelector('.nola-workbench-sidebar .nola-nav-button[data-active="true"]')`), false, 'Filtering must not select the new conversation action')
    await input('.nola-workbench-sidebar input[type="search"]', '')
    await waitFor(`!!document.querySelector('.nola-workbench-thread .nola-nav-button[data-active="true"]')`)
    await type('Keep generating')
    await click('.aui-composer-send')
    await waitFor(`!!document.querySelector('.aui-composer-cancel')`)
    await evaluate(`window.workbenchConversation=document.querySelector('[data-testid="native-conversation"]'); location.hash='#/settings/general'`)
    await waitFor(`!!document.querySelector('.settings-page')`)
    assert.ok(await evaluate(`document.querySelector('.nola-workbench-page').hidden`))
    assert.ok(await evaluate(`!!document.querySelector('.aui-composer-cancel')`), 'generation continues while settings is visible')
    await screenshot('settings-during-generation')
    await evaluate(`location.hash='#/workbench'`)
    await waitFor(`!!document.querySelector('.nola-workbench-sidebar')`)
    assert.ok(await evaluate(`window.workbenchConversation===document.querySelector('[data-testid="native-conversation"]')`))
    await waitFor(`!document.querySelector('.aui-composer-cancel')`)
    await type('Draft retained across pages')
    await evaluate(`location.hash='#/settings/general'`)
    await waitFor(`!!document.querySelector('.settings-page')`)
    await evaluate(`location.hash='#/workbench'`)
    await waitFor(`!!document.querySelector('.nola-workbench-sidebar')`)
    assert.equal(await evaluate(`document.querySelector('.aui-composer-input').value`), 'Draft retained across pages')
    await evaluate(`(()=>{const el=document.querySelector('.aui-composer-input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));})()`)
    await waitFor(`document.querySelector('.aui-composer-input').value===''`)
    for (const theme of ['light', 'dark']) {
      await evaluate(`window.nolaTranslator.updateSettings({theme:${JSON.stringify(theme)}})`)
      await waitFor(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`)
      await assertSelectionContrast()
      assert.ok(await evaluate(`(()=>{
        const buttons=[...document.querySelectorAll('[data-slot="message-actions"] button')];
        return buttons.length >= 2 && buttons.every(button=>button.getAttribute('aria-label') && getComputedStyle(button).borderRadius==='18px');
      })()`), 'Message actions must retain accessible names and the product button radius')
      assert.ok(await evaluate(`(()=>{
        const action=document.querySelector('.nola-workbench-sidebar .nola-nav-button');
        const thread=document.querySelector('.nola-workbench-thread .nola-nav-button');
        const a=getComputedStyle(action), b=getComputedStyle(thread);
        return ['height','fontFamily','fontSize','fontWeight','borderRadius'].every(key=>a[key]===b[key]);
      })()`), 'Conversation rows must use the main navigation geometry and typography')
      await evaluate(`document.querySelector('[data-testid="native-composer"]').parentElement.style.transform='translateX(37px)'`)
      await click('[data-testid="native-composer"] [data-menu-anchor="models"]')
      await waitFor(`!!document.querySelector('[data-slot="composer-menu-item"][data-selected="true"]')`)
      assert.ok(await evaluate(`(()=>{const t=document.querySelector('[data-menu-anchor="models"]').getBoundingClientRect(),m=document.querySelector('[data-slot="composer-menu"][data-open]').getBoundingClientRect();return Math.abs(m.left-Math.max(8,Math.min(innerWidth-m.width-8,t.left)))<2 && (t.top-m.height-8<8 || Math.abs(m.bottom-t.top+8)<2)})()`), 'Model menu must align with its trigger inside a transformed container')
      assert.ok(await evaluate(`(()=>{
        const item=document.querySelector('[data-slot="composer-menu-item"][data-selected="true"]');
        const probe=document.createElement('div');probe.className='type-body';probe.style.cssText='background:var(--accent-soft);color:var(--accent-foreground)';document.body.append(probe);
        const a=getComputedStyle(item), b=getComputedStyle(probe);
        const matches=['backgroundColor','color','fontFamily','fontSize'].every(key=>a[key]===b[key]);probe.remove();return matches;
      })()`), 'Selected model must use product selection and control font tokens')
      await screenshot('models-' + theme)
      await click('[data-testid="native-composer"] [data-menu-anchor="models"]')
      await click('[data-testid="native-composer"] [data-menu-anchor="effort"]')
      await waitFor(`!!document.querySelector('[data-slot="composer-menu"][data-open]')`)
      assert.ok(await evaluate(`(()=>{const t=document.querySelector('[data-menu-anchor="effort"]').getBoundingClientRect(),m=document.querySelector('[data-slot="composer-menu"][data-open]').getBoundingClientRect();return Math.abs(m.left-Math.max(8,Math.min(innerWidth-m.width-8,t.left)))<2 && (t.top-m.height-8<8 || Math.abs(m.bottom-t.top+8)<2)})()`), 'Effort menu must align with its trigger inside a transformed container')
      await click('[data-testid="native-composer"] [data-menu-anchor="effort"]')
      await evaluate(`document.querySelector('[data-testid="native-composer"]').parentElement.style.transform=''`)
      await screenshot('embedded-' + theme)
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-slot="composer-bar"]')).backdropFilter`), 'none')
    }
    for (const [width, height, zoom] of [[760,600,1],[1180,780,2]]) {
      win.setSize(width, height)
      win.webContents.setZoomFactor(zoom)
      await pause(400)
      await screenshot(zoom===2 ? 'embedded-zoom-200' : 'embedded-narrow')
      await click('[data-testid="native-composer"] [data-menu-anchor="models"]')
      await waitFor(`!!document.querySelector('[data-slot="composer-menu"][data-open]')`)
      assert.ok(await evaluate(`(()=>{const r=document.querySelector('[data-slot="composer-menu"][data-open]').getBoundingClientRect();return r.left>=0 && r.top>=0 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1;})()`), 'Model menu must remain inside the viewport at narrow widths and 200% zoom')
      await screenshot(zoom===2 ? 'models-zoom-200' : 'models-narrow')
      await click('[data-testid="native-composer"] [data-menu-anchor="models"]')
    }
    win.webContents.setZoomFactor(1)
    win.setSize(1180,780)
    await pause(300)
    await evaluate(`(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{const stream=await original(options);window.fixtureMicTracks=stream.getTracks();return stream;};})()`)
    await click('[data-slot="composer-voice-button"]')
    await waitFor(`window.fixtureMicTracks?.some(track=>track.readyState==='live')`)
    await evaluate(`location.hash='#/settings/general'`)
    await waitFor(`window.fixtureMicTracks.every(track=>track.readyState==='ended')`)
    await evaluate(`location.hash='#/workbench'`)
    await waitFor(`!!document.querySelector('.nola-workbench-sidebar')`)
    await send('Show widget')
    await waitFor(`document.body.innerText.includes('Native generated UI')`)
    await waitFor(`document.body.innerText.includes('Native widget completed') && !document.querySelector('.aui-composer-cancel')`)
    const prefaceCount = await evaluate(`document.body.textContent.split('Preparing native generated UI.').length - 1`)
    assert.equal(prefaceCount, 1, 'Tool continuation must not repeat its preface')
    await send('Plan native task')
    await waitFor(`!!document.querySelector('[data-slot="agent-plan"]') && document.body.innerText.includes('Inspect configuration') && !document.querySelector('.aui-composer-cancel')`)
    await screenshot('native-catalog-rebuilt-layout')
    await send('Run approved command')
    await waitFor(`!!document.querySelector('[data-slot="approval-card"]')`)
    assert.deepEqual(await evaluate(`(() => {
      const s = getComputedStyle(document.querySelector('[data-slot="approval-card-allow-once"]'));
      return [s.fontSize, s.lineHeight, s.fontWeight];
    })()`), ['15px', '22px', '500'], 'Compact approval actions use dark Body typography')
    assert.equal(await evaluate(`window.nolaTranslator.fixtureTerminalCount()`), 0)
    await click('[data-slot="approval-card-allow-once"]')
    await waitFor(`document.body.innerText.includes('Native approved terminal output') && !document.querySelector('.aui-composer-cancel')`)
    assert.equal(await evaluate(`window.nolaTranslator.fixtureTerminalCount()`), 1)
    assert.ok(await evaluate(`!!document.querySelector('[data-slot="terminal-block"]')`))
    await evaluate(`[...document.querySelectorAll('aside button')].find(el=>el.innerText.includes('新建对话')).click()`)
    await click('[data-testid="native-composer"] [data-slot="composer-model-trigger"]')
    await waitFor(`!!document.querySelector('[data-slot="composer-menu"][data-open]')`)
    const names = await evaluate(`[...document.querySelectorAll('[data-slot="composer-menu"][data-open] [data-slot="composer-menu-item"]')].map(el=>el.querySelector('span')?.innerText || el.innerText)`)
    assert.equal(names.filter(name => name === 'Existing language model').length, 2)
    for (const name of ['Installed Qwen3-ASR Q4_K', 'Installed Index Translate Q4_K_M', 'Installed custom TTS']) assert.ok(names.includes(name), name)
    for (const name of ['Whisper', 'NLLB', 'Uninstalled model', 'LLM']) assert.ok(!names.includes(name), name)
    await evaluate(`[...document.querySelectorAll('[data-slot="composer-menu-item"]')].find(el=>el.querySelector('span')?.innerText==='Installed Qwen3-ASR Q4_K').click()`)
    await waitFor(`!document.querySelector('.aui-composer-input').readOnly`)
    await type('empty')
    const addVideo = `async () => {
      const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
      const context = new AudioContext(); const oscillator = context.createOscillator();
      const destination = context.createMediaStreamDestination(); oscillator.connect(destination); oscillator.start(); await context.resume();
      const stream = canvas.captureStream(10); destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' }); const chunks = [];
      recorder.ondataavailable = event => chunks.push(event.data);
      const stopped = new Promise(resolve => recorder.onstop = resolve);
      recorder.start(); const timer = setInterval(() => canvas.getContext('2d').fillRect(0, 0, 16, 16), 100);
      await new Promise(resolve => setTimeout(resolve, 1500)); recorder.stop(); await stopped; clearInterval(timer);
      stream.getTracks().forEach(track => track.stop()); oscillator.stop(); await context.close();
      const clipboard = new DataTransfer(); clipboard.items.add(new File(chunks, 'very-long-video-filename-for-attachment-layout-and-transcription.webm', { type: 'video/webm' }));
      document.querySelector('.aui-composer-input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true }));
    }`
    await evaluate(`(${addVideo})()`)
    await waitFor(`!!document.querySelector('[data-slot="composer-attachments"] [data-slot="file-root"]')`)
    await click('.aui-composer-send')
    await waitFor(`!!document.querySelector('[data-role="assistant"] [data-slot="run-activity"][data-status="running"]') && document.body.innerText.includes('提取视频音轨')`)
    assert.equal(await evaluate(`document.querySelector('[data-testid="native-composer"]').innerText.includes('正在准备文件并提取音频')`), false)
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-role="user"]')].some(el => el.innerText.includes('正在准备文件并提取音频'))`), false)
    await screenshot('asr-preparing-video')
    await waitFor(`!!document.querySelector('[data-role="assistant"] [data-slot="run-activity"][data-status="running"]') && [...document.querySelectorAll('[data-slot="tool-call"]')].some(el => el.innerText.includes('语音识别'))`)
    await screenshot('asr-transcribing-video')
    await waitFor(`document.body.innerText.includes('识别已完成，未检测到可识别的语音')`)
    await evaluate(`(${addVideo})()`)
    await waitFor(`!!document.querySelector('[data-slot="composer-attachments"] [data-slot="file-root"]')`)
    await click('.aui-composer-send')
    await waitFor(`document.body.innerText.includes('Fixture video transcript')`)
    assert.equal(await evaluate(`document.querySelectorAll('[data-role="user"] [data-slot="file-root"]').length`), 2)
    assert.equal(await evaluate(`document.querySelectorAll('[data-role="user"] video').length`), 2)
    assert.equal(await evaluate(`document.querySelectorAll('[data-role="user"] audio').length`), 0)
    assert.ok(await evaluate(`[...document.querySelectorAll('[data-role="user"] [data-slot="file-name"]')].every(el => el.textContent.endsWith('.webm'))`))
    assert.equal(await evaluate(`document.querySelectorAll('[data-role="assistant"] [data-slot="run-activity"][data-status="complete"]').length`), 2)
    assert.ok(await evaluate(`[...document.querySelectorAll('[data-role="user"] [data-slot="file-root"]')].every(el => el.getBoundingClientRect().right <= innerWidth && el.scrollWidth <= el.clientWidth + 1)`))
    await screenshot('asr-video-result')
    const selectInstalled = async name => {
      await click('[data-testid="native-composer"] [data-slot="composer-model-trigger"]')
      await waitFor(`!!document.querySelector('[data-slot="composer-menu"][data-open]')`)
      await evaluate(`[...document.querySelectorAll('[data-slot="composer-menu-item"]')].find(el=>el.querySelector('span')?.innerText===${JSON.stringify(name)}).click()`)
    }
    await selectInstalled('Installed Index Translate Q4_K_M')
    await type('Translate this text'); await click('.aui-composer-send')
    await waitFor(`document.querySelectorAll('[data-slot="run-activity"][data-status="running"]').length > 0`)
    await waitFor(`document.body.innerText.includes('Fixture translation result') && !document.querySelector('.aui-composer-cancel')`)
    await selectInstalled('Installed custom TTS')
    await send('Synthesize this text')
    await waitFor(`!!document.querySelector('[data-role="assistant"] audio')`)
    await screenshot('direct-mt-tts-results')
    await selectInstalled('Existing language model')
    await evaluate(`[...document.querySelectorAll('aside button')].find(el=>el.innerText.includes('新建对话')).click()`)
    for (const [prompt, model] of [['Use default translation', 'resource:index-translate-2b-q4-k-m'], ['Use default speech', 'resource:hub:voice/custom'], ['Use default recognition', 'resource:qwen3-asr-1.7b-crisp-q4-k']]) {
      if (prompt.includes('recognition')) {
        await evaluate(`(${addVideo})()`)
        await waitFor(`!!document.querySelector('[data-slot="composer-attachments"] [data-slot="file-root"]')`)
      }
      await send(prompt)
      await waitFor(`!document.querySelector('.aui-composer-cancel') && !!document.querySelector('[data-slot="run-activity"][data-status="complete"]')`)
      await evaluate(`[...document.querySelectorAll('[data-slot="run-activity"]')].at(-1).querySelector('button').click()`)
      assert.ok(await evaluate(`[...document.querySelectorAll('[data-slot="run-activity"]')].at(-1).textContent.includes(${JSON.stringify(model)})`), `Tool must use ${model}`)
    }
    assert.ok(await evaluate(`!!document.querySelector('[data-role="assistant"] audio')`))
    assert.equal(await evaluate(`document.querySelectorAll('[data-role="user"] video').length`), 1)
    await screenshot('language-model-default-tools')
    await click('[data-testid="native-composer"] [data-slot="composer-model-trigger"]')
    await waitFor(`!!document.querySelector('[data-slot="composer-menu"][data-open]')`)
    await evaluate(`[...document.querySelectorAll('[data-slot="composer-menu-item"]')].find(el=>el.innerText==='模型网关').click()`)
    await pause(200)
    assert.equal(mainPage, '#/model-gateway')
    assert.equal(await evaluate(`!!document.querySelector('.aui-composer-input')`), true)
    assert.deepEqual(errors.filter(message => !message.includes('Electron Security Warning')), [])
    const singleWindow = BrowserWindow.getAllWindows().length === 1
    await workbench.stop()
    server.closeAllConnections()
    await new Promise(done => server.close(done))
    await writeFile(resolve(output, process.argv.includes('--production') ? 'result-production.json' : 'result-dev.json'), JSON.stringify({ passed: true, errors, singleWindow }, null, 2))
    console.log('assistant-ui: embedded single-window shell, background generation, drafts, microphone cleanup, themes, solid surfaces, narrow/200% layout, media and native tools passed')
    BrowserWindow.getAllWindows().forEach(item => item.destroy())
    app.exit(0)
  }
  void app.whenReady().then(run).catch(error => { console.error(error); app.exit(1) })
}
