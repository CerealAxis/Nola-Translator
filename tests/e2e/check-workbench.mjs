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
  if (!process.argv.includes('--skip-build')) await build({ configFile: false, root: resolve('src/renderer'), base: './', plugins: [react(), tailwind()],
    resolve: { alias: { '@': resolve('src/renderer'), '@renderer': resolve('src/renderer') } },
    build: { rollupOptions: { input: resolve('src/renderer/workbench.html') }, outDir: resolve(output, 'renderer'), emptyOutDir: true, minify: false, chunkSizeWarningLimit: 5000 } })
  const { build: bundle } = await import('esbuild')
  await bundle({ entryPoints: ['src/main/workbench.ts'], bundle: true, packages: 'external', platform: 'node', format: 'esm', external: ['electron'], outfile: resolve(output, 'window.mjs') })
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
    if (process.argv.includes('--smoke')) {
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
    }
    ipcMain.handle('fixture:settings', () => settings)
    ipcMain.handle('fixture:resources', () => ({ storagePath: '', resources }))
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
      settings = { ...settings, ...patch }
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
      listResources:()=>ipcRenderer.invoke('fixture:resources'),hasTranslationCredential:async()=>false,
      streamLanguageModel:request=>ipcRenderer.invoke('app:language-model:stream',request),
      resolveLanguageModelAudio:result=>ipcRenderer.invoke('app:language-model:audio-result',result),
      directModel:request=>ipcRenderer.invoke('fixture:direct-model',request),
      agentWorkspace:action=>ipcRenderer.invoke('app:agent-workspace',action),
      cancelLanguageModel:id=>{chunks.push('CANCEL:'+id);return ipcRenderer.invoke('app:language-model:cancel',id)},
      onLanguageModelStream:fn=>{const cb=(_,data)=>{chunks.push(data.chunk);fn(data)};ipcRenderer.on('app:language-model:chunk',cb);return()=>ipcRenderer.removeListener('app:language-model:chunk',cb)},
      openMainPage:path=>ipcRenderer.invoke('fixture:main-page',path),
      isMainWindowMaximized:async()=>false,onMainWindowMaximizedChanged:()=>()=>{},
      minimizeMainWindow:async()=>{},toggleMainWindowMaximize:async()=>false,closeMainWindow:async()=>{},
      openWorkbench:surface=>ipcRenderer.invoke('workbench:open',surface)
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
          await pause(500)
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
    if (process.argv.includes('--smoke')) {
      settings.translation.customModels[0].endpoint = origin + '/anthropic'
      settings.translation.customModels[0].apiFormat = 'anthropic'
    }
    if (process.argv.includes('--production')) delete process.env.ELECTRON_RENDERER_URL
    else process.env.ELECTRON_RENDERER_URL = origin
    const fixtureProject = { id: 'c29b359b-c948-40b2-99ed-6143e9243fd4', name: 'Fixture project', path: 'C:/fixture' }
    const workspaceSnapshot = { projects: [fixtureProject], selectedProject: process.argv.includes('--smoke') ? fixtureProject.id : null, skills: [], subagents: [], activity: [], sandbox: { available: false, backend: 'fixture', reason: 'fixture isolation disabled' } }
    const workspace = { project: async () => workspaceSnapshot.selectedProject ? fixtureProject : undefined, skills: async () => [], definitions: async () => workspaceSnapshot.subagents, canUseTerminal: async () => !!workspaceSnapshot.selectedProject,
      terminal: async () => { terminalExecutions++; return JSON.stringify({ exitCode: 0, output: 'Native approved terminal output' }) },
      action: async action => { if (action.action === 'subagent') workspaceSnapshot.subagents = [...workspaceSnapshot.subagents.filter(item => item.id !== action.agent.id), action.agent]; if (action.action === 'selectProject') workspaceSnapshot.selectedProject = action.id; return workspaceSnapshot } }
    const { registerWorkbench } = await import(pathToFileURL(resolve(output, 'window.mjs')).href)
    const workerPath = resolve(output, 'fixture-model-worker.cjs')
    await writeFile(workerPath, `require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
      const request = JSON.parse(line);
      if (request.kind === 'asr' && !request.audio?.startsWith('data:audio/wav;base64,')) throw new Error('ASR requires normalized audio');
      const result = request.kind === 'tts' ? { text: '', audio: ${JSON.stringify(fixtureAudio)}, voices: ['default-fixture-voice'] }
        : { text: request.kind === 'asr' ? 'Default ASR tool transcript' : 'Default MT tool translation' };
      setTimeout(() => process.stdout.write(JSON.stringify({ ...result, id: request.id }) + '\\n'), 800);
    });`)
    registerWorkbench(() => settings.theme, resolve('out/main'), options => {
      const win = new BrowserWindow({ ...options, show: false, webPreferences: { ...options.webPreferences, preload, offscreen: true, backgroundThrottling: false } })
      win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
      win.webContents.on('render-process-gone', (_, details) => errors.push(JSON.stringify(details)))
      return win
    }, { getSettings: () => settings, getCredential: async () => 'fixture-secret', workspace,
      directLaunch: async () => ({ command: process.execPath, args: [workerPath], cwd: output, env: { ELECTRON_RUN_AS_NODE: '1' } }) })
    const host = new BrowserWindow({ show: false, webPreferences: { preload, offscreen: true, backgroundThrottling: false } })
    if (process.argv.includes('--production')) await host.loadFile(resolve('out/renderer/index.html'))
    else await host.loadURL(origin + '/host')
    await host.webContents.executeJavaScript(`window.nolaTranslator.openWorkbench('chat')`)
    const win = BrowserWindow.getAllWindows().find(item => item !== host)
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
    await waitFor(`!!document.querySelector('.aui-composer-input')`)
    if (process.argv.includes('--smoke')) {
      assert.ok(await evaluate(`document.documentElement.classList.contains('native-agent-document')`))
      assert.match(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--background').trim()`), /^oklch\((?:1|100%) 0 0\)$/)
      await waitFor(`document.querySelector('[data-testid="native-composer"] [data-slot="composer-model-trigger"]').innerText.includes('Existing language model')`)
      assert.ok(await evaluate(`!!document.querySelector('[data-testid="native-agent-app"]')`))
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-slot="composer-bar"]')).padding`), '10px')
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-slot="composer-bar"]')).borderTopWidth`), '1px')
      assert.ok(await evaluate(`!!document.querySelector('[data-slot="composer-voice-button"]')`))
      await type('Hello')
      await click('.aui-composer-send')
      await waitFor(`document.body.innerText.includes('Native reasoning stream')`)
      await waitFor(`document.body.innerText.includes('Native streamed answer') && !document.querySelector('.aui-composer-cancel')`)
      await waitFor(`document.querySelector('[data-slot="composer-context"]').textContent.includes('0.15')`)
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
      await evaluate(`[...document.querySelectorAll('[data-slot="composer-menu-item"]')].find(el=>el.innerText==='模型管理').click()`)
      await pause(200)
      assert.equal(mainPage, '#/models')
      assert.equal(await evaluate(`!!document.querySelector('.aui-composer-input')`), true)
      assert.deepEqual(errors.filter(message => !message.includes('Electron Security Warning')), [])
      console.log('assistant-ui: native chat shell, composer, approved terminal, native streaming, reasoning, token usage, microphone, generative tool UI, installed model catalog and management navigation passed')
      BrowserWindow.getAllWindows().forEach(item => item.destroy())
      await new Promise(done => server.close(done))
      app.quit()
      return
    }
    await evaluate(`document.fonts.ready.then(()=>true)`)
    await screenshot('welcome-light')
    await send('介绍一下你的功能')
    await screenshot('conversation-light')
    await click('[data-testid="native-composer"] [data-slot="composer-model-trigger"]')
    await waitFor(`!!document.querySelector('[cmdk-item]')`)
    await screenshot('model-selector')
    const selectModel = async name => {
      if (!await evaluate(`!!document.querySelector('[cmdk-item]')`)) await click('[data-testid="native-composer"] [data-slot="composer-model-trigger"]')
      await waitFor(`!!document.querySelector('[cmdk-item]')`)
      await evaluate(`[...document.querySelectorAll('[cmdk-item]')].find(el=>el.innerText.includes(${JSON.stringify(name)})).click()`)
      await pause(200)
    }
    await selectModel('Index Translate')
    await waitFor(`!!document.querySelector('.aui-composer-add-attachment') || !!document.querySelector('input[type="file"]')`)
    await evaluate(`(()=>{
      const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
      const data=new DataTransfer();data.items.add(new File([bytes],'screenshot.png',{type:'image/png'}));
      document.querySelector('.aui-composer-input').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true}));
    })()`)
    await waitFor(`!!document.querySelector('.aui-attachment-tile')`)
    await screenshot('translation')
    await send('翻译这张截图')
    await waitFor(`document.body.innerText.includes('截图翻译示例')`)
    await selectModel('IndexTTS')
    await send('Hello, this is a voice preview.')
    await waitFor(`!!document.querySelector('audio')`)
    await waitFor(`document.querySelector('audio').readyState >= 1`)
    assert.ok(await evaluate(`document.querySelector('audio').duration > 0`))
    await click('[data-slot="audio-player"] button')
    await waitFor(`document.querySelector('audio').currentTime > 0`)
    await evaluate(`document.querySelector('audio').pause()`)
    await screenshot('tts')
    await selectModel('SenseVoice')
    assert.equal(await evaluate(`document.querySelector('.aui-composer-input').readOnly`), false)
    await click('[aria-label="开始录音"]')
    await waitFor(`!!document.querySelector('[aria-pressed="true"]')`)
    await pause(500)
    await click('[aria-label="结束录音并识别"]')
    await waitFor(`document.body.innerText.includes('这是一段语音识别示例文字')`)
    await screenshot('asr')
    await selectModel('LLM')
    await click('[data-slot="aui_thread-list-new"]')
    await waitFor(`document.querySelectorAll('[data-role="assistant"]').length===0`)
    await send('第二个会话')
    assert.equal(await evaluate(`document.querySelectorAll('[data-slot="aui_thread-list-item"]').length`), 2)
    await input('[data-slot="aui_thread-list-search"] input', '介绍')
    await pause(150)
    assert.equal(await evaluate(`document.querySelectorAll('[data-slot="aui_thread-list-item"]').length`), 1)
    await input('[data-slot="aui_thread-list-search"] input', '')
    await click('[data-slot="aui_thread-list-item-trigger"]')
    await host.webContents.executeJavaScript(`window.nolaTranslator.openWorkbench('chat')`)
    assert.equal(BrowserWindow.getAllWindows().length, 2)
    await evaluate(`window.nolaTranslator.updateSettings({theme:'dark',uiLanguage:'en'})`)
    await pause(400)
    await screenshot('conversation-dark-en')
    win.setSize(760, 600)
    await screenshot('minimum-dark')
    assert.deepEqual(errors.filter(message => !message.includes('Electron Security Warning')), [])
    await writeFile(resolve(output, 'result.json'), JSON.stringify({ passed: true, errors }, null, 2))
    console.log('assistant-ui: independent window, models, conversations, audio, themes and minimum layout passed')
    BrowserWindow.getAllWindows().forEach(item => item.destroy())
    await new Promise(done => server.close(done))
    app.quit()
  }
  void app.whenReady().then(run).catch(error => { console.error(error); app.exit(1) })
}
