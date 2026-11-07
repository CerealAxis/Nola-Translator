const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { setTimeout: sleep } = require('node:timers/promises')
const output = path.resolve(__dirname, '../../artifacts/vis-chapter2/check')
app.setPath('userData', path.join(output, 'plugin-browser-cache', String(process.pid)))
app.commandLine.appendSwitch('force-device-scale-factor', '1')

async function check() {
  await app.whenReady()
  nativeTheme.themeSource = 'light'
  const origin = new URL(process.argv[2] || 'http://localhost:5194')
  const win = new BrowserWindow({ width: 1440, height: 1000, useContentSize: true, show: false,
    webPreferences: { offscreen: true, sandbox: true, backgroundThrottling: false, partition: 'vis-foundations-check' } })
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']}, (details, callback) => {
    callback({cancel:new URL(details.url).origin !== origin.origin})
  })
  win.webContents.debugger.attach('1.3')
  const errors = []
  const hydrationWarnings = []
  win.webContents.on('console-message', ({ level, message }) => {
    // The same site-wide warning also occurs on help pages without demonstrations.
    if (message === 'Hydration completed but contains mismatches.') hydrationWarnings.push(message)
    else if (level === 'error' && !/Failed to load resource/.test(message)) errors.push(message)
  })
  const read = source => win.webContents.executeJavaScript(`(() => {
    const boxes = [...document.querySelectorAll('.vitepress-demo-plugin-preview')];
    const box = boxes[0];
    const focusBox = boxes.find(el => el.querySelector('[data-scene="environment-focus"]'));
    const find = (scope, selector, text) => [...scope.querySelectorAll(selector)].find(el => el.textContent.trim() === text);
    return (${source});
  })()`)
  const wait = async (source, timeout = 18000) => {
    const end = Date.now() + timeout
    while (!await read(`Boolean(${source})`)) {
      if (Date.now() > end) throw new Error(`Timed out: ${source}`)
      await sleep(80)
    }
  }
  const open = async (route, count) => {
    await win.loadURL(new URL(route, origin).href)
    await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
    await wait(`document.querySelector('.vp-doc h1') && boxes.length === ${count} && boxes.every(el => el.querySelector('.foundation-demo'))`)
    await wait("document.cookie.includes('nola_cookie_consent=') || document.querySelector('.cm__btn[data-role=necessary]')")
    await read(`document.querySelector('.cm__btn[data-role="necessary"]')?.click()`)
    await wait("!document.documentElement.classList.contains('show--consent')")
  }
  const click = async expression => { await read(`(() => { const el = ${expression}; if (!el) throw new Error('Missing target: ' + ${JSON.stringify(expression)}); el.dispatchEvent(new MouseEvent('click', {bubbles: true})); })()`); await sleep(100) }
  const type = async (expression, value) => {
    await read(`(() => { const input = ${expression}; input.focus(); input.select(); })()`)
    await win.webContents.insertText(value)
    await sleep(100)
  }
  const screenshot = async name => {
    await sleep(180)
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, `${name}.png`), (await win.webContents.capturePage()).toPNG())
  }
  try {
    const foundationOrder = ['accessibility', 'app-icons', 'branding', 'color', 'dark-mode', 'icons', 'images', 'inclusion', 'layout', 'materials', 'motion', 'right-to-left', 'typography', 'writing']
    const articles = process.env.NOLA_VIS_PAGES ? process.env.NOLA_VIS_PAGES.split(',') : foundationOrder
    let previewCount = 0;
    for (const article of articles) {
      const md = await fs.readFile(path.resolve(__dirname, `../design-system/foundations/${article}.md`), 'utf8');
      assert.ok(md.length > 400, `${article}: article missing`);
      assert.ok(!/^(来源|组件参考|参考)[：:]/m.test(md), `${article}: reference footer`);
      assert.ok(!/Apple 的|Nola 的|借鉴这一/.test(md), `${article}: source comparison in product guidance`);
      const count = [...md.matchAll(/<demo\s/g)].length;
      await open(`/vis/foundations/${article}`, count);
      const sidebarOrder = await read(`(() => {
        const group = find(document, '.VPSidebar .VPSidebarItem > .item > .text', '基础样式')?.closest('.VPSidebarItem');
        return [...(group?.querySelectorAll(':scope > .items > .VPSidebarItem > .item > a') ?? [])]
          .map(link => new URL(link.href).pathname.split('/').pop().replace(/\\.html$/, ''));
      })()`);
      assert.deepEqual(sidebarOrder, foundationOrder, 'Foundations links must appear directly under the chapter in Apple order');
      await screenshot(`${article}-light`);
      if (article === 'accessibility') {
        await type("focusBox.querySelector('input')", '海岸笔记');
        await read("focusBox.querySelector('input').scrollIntoView({block:'center',behavior:'instant'})");
        win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});
        win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});
        await wait("document.activeElement?.textContent === '保存名称'");
        await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
        await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
        await wait("focusBox.querySelector('[role=status]').textContent.includes('海岸笔记')");
      }
      if (article === 'motion') {
        await click("find(box, 'button', '应用校对')");
        await wait("box.querySelector('[data-updated=true]').textContent.includes('向左转')");
        await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
        assert.equal(await read("getComputedStyle(box.querySelector('[data-updated=true]')).animationName"), 'none');
        await click("find(box, 'button', '撤销校对')");
        await wait("box.textContent.includes('向右转')");
        await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});
      }
      if (article === 'right-to-left') {
        assert.ok(await read("[...box.querySelectorAll('p[lang=en]')].every(el=>el.dir==='ltr') && [...box.querySelectorAll('p[lang=ar]')].every(el=>el.dir==='rtl') && [...box.querySelectorAll('.fe-short-list')].every(el=>getComputedStyle(el).textAlign==='start')"));
      }

      assert.equal(await read("document.querySelectorAll('.vp-doc h1').length"), 1);
      const inspect = () => read(`({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,boxes:boxes.map(el=>({width:el.clientWidth,overflow:el.scrollWidth-el.clientWidth,font:getComputedStyle(el.querySelector('.foundation-demo')).fontSize})),images:[...document.querySelectorAll('.vp-doc img')].filter(el=>!el.complete || !el.naturalWidth).map(el=>el.src)})`);
      let geometry = await inspect();
      assert.ok(geometry.overflow <= 1, `${article}: page overflow ${JSON.stringify(geometry)}`);
      assert.deepEqual(geometry.images,[],`${article}: broken images`);
      for (const box of geometry.boxes) assert.ok(box.width>300 && box.overflow<=1 && box.font==='14px',`${article}: demo geometry ${JSON.stringify(box)}`);
      for (let i=0;i<count;i++) {
        await read(`boxes[${i}].scrollIntoView({block:'center',behavior:'instant'})`);
        await screenshot(`${article}-demo-${i+1}`);
      }
      await read("document.documentElement.classList.add('dark')");
      await sleep(100);
      if(count) await read("boxes[0].scrollIntoView({block:'center',behavior:'instant'})");
      else await read("window.scrollTo({top:0,behavior:'instant'})");
      await screenshot(`${article}-dark`);
      if (count) {
        const darkStyle = await read("(() => { const style = getComputedStyle(box.querySelector('.foundation-demo')); return {primary:style.getPropertyValue('--primary').trim(),foreground:style.getPropertyValue('--foreground').trim()}; })()");
        assert.deepEqual(darkStyle,{primary:'#60a5fa',foreground:'#f5f5f5'},`${article}: dark semantic palette`);
      }

      geometry = await inspect();
      assert.ok(geometry.overflow<=1 && geometry.boxes.every(el=>el.overflow<=1),`${article}: dark overflow`);
      await read("document.documentElement.classList.remove('dark')");
      win.setContentSize(390,844);
      await sleep(100);
      geometry = await inspect();
      assert.ok(geometry.overflow<=1 && geometry.boxes.every(el=>el.overflow<=1),`${article}: narrow overflow ${JSON.stringify(geometry)}`);
      await read("window.scrollTo({top:0,behavior:'instant'})");
      await screenshot(`${article}-narrow`);
      win.setContentSize(1440,1000);
      win.webContents.setZoomFactor(2);
      await sleep(100);
      geometry = await inspect();
      assert.ok(geometry.overflow<=1 && geometry.boxes.every(el=>el.overflow<=1),`${article}: 200% zoom overflow ${JSON.stringify(geometry)}`);
      win.webContents.setZoomFactor(1);
      previewCount+=count;
      console.log(`${article}: article + ${count} previews, light/dark/narrow/200% geometry passed`);
    }
    assert.deepEqual(errors, [], 'browser console errors');
    console.log(`Passed: ${articles.length} foundation articles, ${previewCount} previews. Hydration warnings: ${hydrationWarnings.length}`);
  } catch (error) { await screenshot('failure'); throw error } finally { win.destroy() }
}
check().then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1) });
