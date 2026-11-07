const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { setTimeout: sleep } = require('node:timers/promises')
const output = path.resolve(__dirname, '../../artifacts/vis-check')
app.setPath('userData', path.join(output, 'plugin-browser-cache'))
app.commandLine.appendSwitch('force-device-scale-factor', '1')

async function check() {
  await app.whenReady()
  nativeTheme.themeSource = 'light'
  const origin = new URL(process.argv[2] || 'http://localhost:5194')
  const win = new BrowserWindow({ width: 1440, height: 1080, useContentSize: true, show: false,
    webPreferences: { offscreen: true, sandbox: true, backgroundThrottling: false } })
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']}, (details, callback) => {
    callback({cancel:new URL(details.url).origin !== origin.origin})
  })
  await win.webContents.session.clearCache()
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
    await wait(`boxes.length === ${count} && boxes.every(el => el.querySelector('.nola-component-demo, .caption-comparison'))`)
    await sleep(150)
    await read(`document.querySelector('.cm__btn[data-role="necessary"]')?.click()`)
    await sleep(100)
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
    const pages = { structure: 4, alignment: 3, contrast: 4, repetition: 2, interaction: 2, stay: 4, lightweight: 6, invitation: 2, transition: 7, response: 3 }
    let total = 0
    for (const [page, count] of Object.entries(pages)) {
      await open(`/vis/principles/${page}`, count)
      const geometry = await read(`({
        page: [document.documentElement.clientWidth, document.documentElement.scrollWidth],
        boards: boxes.map(el => { const board = el.querySelector('.fig-board, .fig-stay-example'); const r = board.getBoundingClientRect();
          return { width: Math.round(r.width), height: Math.round(r.height), scroll: board.scrollWidth, client: board.clientWidth }; }),
        controls: boxes.flatMap(el => [...el.querySelectorAll('.button, .input, .select__trigger')].filter(control => control.getClientRects().length && !control.closest('[data-scene=hit-area-links]')).map(control => ({ height: control.getBoundingClientRect().height, font: getComputedStyle(control).fontSize }))),
        iframes: document.querySelectorAll('.vis-frame, .principle-figure').length
      })`)
      assert.equal(geometry.iframes, 0, `${page}: old iframe`)
      assert.ok(geometry.page[1] <= geometry.page[0] + 1, `${page}: page overflow ${JSON.stringify(geometry)}`)
      for (const board of geometry.boards) {
        assert.ok(board.width > 300 && board.height > 40, `${page}: missing board`)
        assert.ok(board.scroll <= board.client + 1, `${page}: board overflow ${JSON.stringify(board)}`)
      }
      for (const control of geometry.controls) {
        assert.ok(control.height >= 35 && control.height <= 37, `${page}: control height ${JSON.stringify(control)}`)
        assert.ok(['14px', '15px'].includes(control.font), `${page}: control font ${JSON.stringify(control)}`)
      }
      total += count
      console.log(`${page}: ${count} native plugin previews, layout and controls passed`)
      assert.ok(await read("boxes.every(el => { const board = el.querySelector('.fig-board, .fig-stay-example'); return board.inert === !['undo-states','detail-popover','inline-states','edit-states','progressive-options','contextual-tools','invitation-hover','transition-states','transition-slide','transition-carousel','transition-fold','transition-delete','transition-update','transition-callout','visible-tools','hover-tools','edit-mode-tools','search-states','preview-states'].includes(board.dataset.scene); })"), `${page}: inappropriate interaction scope`)
      const beforeClick = await read("boxes.filter(el => el.querySelector('.fig-board, .fig-stay-example').inert).map(el => el.querySelector('.fig-board, .fig-stay-example').textContent)")
      for (let index = 0; index < count; index++) {
        const point = await read(`(() => { const board = boxes[${index}].querySelector('.fig-board, .fig-stay-example'); if (!board.inert) return null; const el = board.querySelector('button'); if (!el) return null;
          el.scrollIntoView({block:'center',behavior:'instant'}); const r = el.getBoundingClientRect(); return {x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2)}; })()`)
        if (point) {
          win.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 })
          win.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
          await sleep(80)
        }
      }
      assert.deepEqual(await read("boxes.filter(el => el.querySelector('.fig-board, .fig-stay-example').inert).map(el => el.querySelector('.fig-board, .fig-stay-example').textContent)"), beforeClick, `${page}: static illustration changed after click`)
      if (page === 'stay') {
        await click("find(boxes[0], 'button', '移除')")
        await wait("boxes[0].querySelector('tbody').rows.length === 2 && document.querySelector('.nola-toast')")
        const toastStyle = await read("({size:getComputedStyle(document.querySelector('.nola-toast-title')).fontSize,weight:getComputedStyle(document.querySelector('.nola-toast-title')).fontWeight})")
        assert.deepEqual(toastStyle, {size:'14px',weight:'500'})
        await screenshot('plugin-undo-toast')
        await click("find(document, '.nola-toast button', '撤销')")
        await wait("boxes[0].querySelector('tbody').rows.length === 3")
        assert.ok(await read("boxes[0].querySelector('tbody tr').textContent.includes('记录 A')"))
        await click("find(boxes[1], 'button', '查看详情')")
        await wait("document.querySelector('.fig-stay-popover')")
        const popupStyle = await read("({radius:getComputedStyle(document.querySelector('.fig-stay-popover')).borderRadius,padding:getComputedStyle(document.querySelector('.fig-stay-popover')).paddingTop,font:getComputedStyle(document.querySelector('.fig-stay-popover [data-slot=popover-title]')).fontSize})")
        assert.deepEqual(popupStyle, {radius:'14px',padding:'20px',font:'20px'})
        await screenshot('plugin-detail-popover')
        await click("find(boxes[1], 'button', '查看详情')")
        await wait("!document.querySelector('.fig-stay-popover')")
        await click("find(boxes[2], 'button', '展开')")
        await wait("boxes[2].querySelector('tbody').rows.length === 4")
        await screenshot('plugin-inline-details')
        await click("find(boxes[2], 'button', '收起')")
        await wait("boxes[2].querySelector('tbody').rows.length === 3")
        await click("boxes[3].querySelector('[role=switch]')")
        await wait("boxes[3].querySelector('[role=combobox]')")
        assert.ok(await read("boxes[3].querySelector('[role=combobox]').textContent.includes('邮件提醒')"))
        await click("boxes[3].querySelector('[role=switch]')")
        await wait("!boxes[3].querySelector('[role=combobox]')")
      }
      if (page === 'interaction') {
        assert.equal(await read("box.querySelectorAll('.card').length"), 0)
        await click("find(box, 'button', '春季调研')")
        await wait("box.querySelector('input')")
        await type("box.querySelector('input')", '夏季调研')
        await click("find(box, 'button', '确定')")
        await wait("find(box, 'button', '夏季调研')")
        await click("find(box, 'button', '夏季调研')")
        await type("box.querySelector('input')", '取消的草稿')
        await click("find(box, 'button', '取消')")
        await wait("find(box, 'button', '夏季调研')")
        await screenshot('plugin-inline-edit')
      }
      if (page === 'lightweight') {
        await click("find(boxes[0], 'button', '收藏 12')")
        await wait("find(boxes[0], 'button', '已收藏 13')")
        await click("find(boxes[0], 'button', '已收藏 13')")
        await wait("find(boxes[0], 'button', '收藏 12')")
        await read("boxes[1].querySelector('tbody button').focus()")
        await wait("getComputedStyle(boxes[1].querySelector('tbody button')).opacity === '1'")
        await click("find(boxes[2], 'button', '修改')")
        assert.ok(await read("(() => { const buttons = boxes[2].querySelectorAll('.fig-light-edit-actions button'); return buttons.length === 2 && Math.abs(buttons[0].getBoundingClientRect().top - buttons[1].getBoundingClientRect().top) < 1; })()"), 'edit actions must share one row')
        await read("boxes[2].scrollIntoView({block:'center',behavior:'instant'})")
        await screenshot('plugin-edit-actions')
        await type("boxes[2].querySelector('input')", '项目介绍')
        await click("find(boxes[2], 'button', '完成')")
        await wait("boxes[2].textContent.includes('项目介绍') && !boxes[2].querySelector('input')")
        const point = await read("(() => { const el = boxes[3].querySelector('button'); el.scrollIntoView({block:'center',behavior:'instant'}); const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()")
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type:'mouseMoved', ...point})
        await wait("[...document.querySelectorAll('[data-slot=tooltip-content]')].some(el=>el.textContent.includes('复制'))")
        await screenshot('plugin-copy-hover')
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type:'mouseMoved', x:1,y:1})
        await read("boxes[0].scrollIntoView({block:'center',behavior:'instant'})")
        await screenshot('plugin-visible-tools')
        await read("boxes[4].scrollIntoView({block:'center',behavior:'instant'})")
        await screenshot('plugin-hit-area')
      }
      if (page === 'invitation') {
        assert.equal(await read("getComputedStyle(boxes[1].querySelector('.card__footer .button')).visibility"), 'hidden')
        await read("boxes[1].querySelector('.fig-dynamic-template').focus()")
        await wait("getComputedStyle(boxes[1].querySelector('.card__footer .button')).visibility === 'visible'")
        await screenshot('plugin-hover-invitation')
      }
      if (page === 'transition') {
        await click("find(boxes[0], 'button', '查看详情')")
        await wait("boxes[0].querySelector('[aria-expanded=true]')")
        await screenshot('plugin-transition-slide')
        await click("find(boxes[0], 'button', '收起详情')")
        await click("boxes[1].querySelector('[aria-label=下一段]')")
        await wait("boxes[1].textContent.includes('第 2 段，共 3 段')")
        await click("boxes[2].querySelector('button')")
        await wait("boxes[2].querySelector('[aria-expanded=true]')")
        await click("find(boxes[3], 'button', '添加条目')")
        await wait("boxes[3].querySelector('tbody').rows.length === 3")
        assert.ok(await read("getComputedStyle(boxes[3].querySelector('.motion-highlight')).backgroundColor !== 'rgba(0, 0, 0, 0)'"))
        await sleep(2300)
        assert.equal(await read("getComputedStyle(boxes[3].querySelector('.motion-highlight')).backgroundColor"), 'rgba(0, 0, 0, 0)')
        await click("find(boxes[3], 'button', '重置')")
        await wait("boxes[3].querySelector('tbody').rows.length === 2")
        await click("find(boxes[4], 'button', '删除草稿')")
        await wait("!boxes[4].textContent.includes('河畔（草稿）')")
        await click("find(boxes[4], 'button', '重置')")
        await wait("boxes[4].textContent.includes('河畔（草稿）')")
        await click("find(boxes[5], 'button', '标为已校对')")
        await wait("boxes[5].querySelector('td.motion-highlight')?.textContent === '已校对'")
        await click("find(boxes[6], 'button', '文件信息')")
        await wait("document.querySelector('.motion-popover')")
        await click("find(boxes[6], 'button', '文件信息')")
        await wait("!document.querySelector('.motion-popover')")
      }
      if (page === 'response') {
        await type("boxes[0].querySelector('input')", '林青')
        await wait("boxes[0].querySelector('tbody').rows.length === 1")
        await type("boxes[0].querySelector('input')", '不存在')
        await wait("boxes[0].textContent.includes('没有匹配项目')")
        await click("find(boxes[0], 'button', '清空搜索')")
        await wait("boxes[0].querySelector('tbody').rows.length === 3")
        await type("boxes[1].querySelector('input')", 'lin')
        await wait("boxes[1].querySelector('[data-slot=field-error]')")
        assert.equal(await read("boxes[1].querySelector('input').getAttribute('aria-invalid')"), 'true')
        await type("boxes[1].querySelector('input')", 'lin@example.com')
        await wait("boxes[1].textContent.includes('邮箱格式正确') && !boxes[1].querySelector('[data-slot=field-error]')")
        await screenshot('plugin-validation-feedback')
      }
      if (page === 'structure') {
        assert.ok(await read("[...document.querySelectorAll('.VPNavBarMenuLink')].some(el => el.textContent.includes('设计原则'))"))
        assert.ok(await read("[...document.querySelectorAll('.VPNavBarMenuLink')].some(el => el.textContent.includes('帮助文档'))"))
        assert.equal(await read("Boolean(document.querySelector('.nola-cookie-settings'))"), false)
        assert.ok(await read("(() => { const sidebar = document.querySelector('.VPSidebar').textContent; return sidebar.includes('DESIGN.md') && !/组件样张|数值规范（英文）|概述|第[一二三四五六七]+章/.test(sidebar) && ![...document.querySelectorAll('.VPSidebar a')].some(el => el.textContent.trim() === '目录'); })()"), 'sidebar should use simplified chapter names')
        const style = await read(`(() => {
          const primary = box.querySelector('.button[data-variant="default"]');
          const secondary = box.querySelector('.button[data-variant="outline"]');
          const tabs = box.querySelector('.tabs__list');
          return { primary: [getComputedStyle(primary).backgroundColor, getComputedStyle(primary).color],
            secondary: getComputedStyle(secondary).borderStyle,
            tabs: [getComputedStyle(tabs).backgroundColor, getComputedStyle(tabs).borderBottomWidth] };
        })()`)
        assert.deepEqual(style.primary, ['rgb(0, 113, 227)', 'rgb(255, 255, 255)'])
        assert.equal(style.secondary, 'solid')
        assert.deepEqual(style.tabs, ['rgb(245, 245, 247)', '0px'])
        await read("window.scrollTo({top:0,behavior:'instant'})")
        const guides = await read(`(() => {
          const title = box.querySelector('.fig-f-gap-label'), header = box.querySelector('.fig-f-gap-section');
          const tools = box.querySelector('.fig-f-gap-tools'), table = box.querySelector('[data-slot=table-container]');
          const content = box.querySelector('.fig-f-app-content'), description = box.querySelector('.card__description');
          const rect = el => el.getBoundingClientRect();
          return { gaps: [rect(description).top-rect(title).bottom, rect(table).top-rect(tools).bottom, rect(content).top-rect(header).bottom],
            marks: [title, tools, header].map(el => { const style = getComputedStyle(el, '::after'); return {width:parseFloat(style.width),height:parseFloat(style.height)}; }),
            width: rect(tools).width };
        })()`)
        for (const [index, gap] of [6,14,24].entries()) {
          assert.ok(Math.abs(guides.gaps[index]-gap)<1, `guide actual gap ${JSON.stringify(guides)}`)
          assert.equal(guides.marks[index].height, gap)
          assert.ok(Math.abs(guides.marks[index].width-guides.width)<1, `guide must span content width ${JSON.stringify(guides)}`)
        }
        await read("boxes[0].scrollIntoView({block:'center',behavior:'instant'})")
        await screenshot('plugin-proximity')
        await read("boxes[2].scrollIntoView({block:'center',behavior:'instant'})")
        await screenshot('plugin-tabs')
      }
    }
    assert.equal(total, 37)
    await open('/vis/', 1)
    await wait("document.querySelector('#vis-specimen-name')")
    const compact = await read("document.querySelector('#vis-specimen-name').getBoundingClientRect().height")
    await click("find(box, 'button', '舒展')")
    assert.equal(await read("document.querySelector('#vis-specimen-name').getBoundingClientRect().height"), 44)
    assert.equal(compact, 36)
    await click("find(box, 'button', '紧凑')")
    await screenshot('plugin-specimen')
    await click("find(box, 'button', '预览字幕')")
    await wait("document.querySelector('[role=dialog]')")
    await click("find(document.querySelector('[role=dialog]'), 'button', '关闭')")
    await wait("!document.querySelector('[role=dialog]')")
    const source = await read("document.querySelector('.vitepress-demo-plugin__container').innerText")
    assert.ok(/specimen|Specimen/.test(source), 'plugin source tabs')
    await click("document.querySelector('.vitepress-demo-plugin-description__handle-btn svg')")
    await wait("document.querySelector('.vitepress-demo-plugin-source').getBoundingClientRect().height > 30")
    await screenshot('plugin-source')
    await open('/vis/principles/structure', 4)
    win.setContentSize(390, 844)
    await sleep(200)
    const narrow = await read("[document.documentElement.clientWidth, document.documentElement.scrollWidth, ...boxes.map(el => el.scrollWidth - el.clientWidth)]")
    assert.ok(narrow[1] <= narrow[0] + 1 && narrow.slice(2).every(value => value <= 1), `narrow overflow: ${narrow}`)
    await screenshot('plugin-mobile')
    await open('/vis/principles/lightweight', 6)
    await click("find(boxes[2], 'button', '修改')")
    const narrowActions = await read("(() => { const buttons = boxes[2].querySelectorAll('.fig-light-edit-actions button'); const rects = [...buttons].map(el => el.getBoundingClientRect()); return { sameRow: Math.abs(rects[0].top - rects[1].top) < 1, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()")
    assert.ok(narrowActions.sameRow && narrowActions.overflow <= 1, `narrow edit actions: ${JSON.stringify(narrowActions)}`)
    assert.deepEqual(errors, [], 'browser console errors')
    console.log(`Known site-wide hydration warnings: ${hydrationWarnings.length}`)
    console.log('Passed: 37 principles, 18 static diagrams, 19 small interactions, specimen density/dialog, source tabs, navigation, consent control and mobile layout')
  } catch (error) { await screenshot('plugin-failure'); throw error } finally { win.destroy() }
}
check().then(() => app.quit()).catch(error => { console.error(error); app.exit(1) })
