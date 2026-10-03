/**
 * 主题预涂。必须在样式表与 React 之前跑完，把深浅色决定落到 <html> 上。
 *
 * 为什么是外部文件而不是内联 <script>：index.html 的 CSP 是 `script-src 'self'`，
 * 内联脚本会被浏览器直接拦掉（控制台报 "Executing inline script violates ... 'script-src self'"），
 * 拦掉之后这个文件等于不存在。放在 public/ 下由同源加载，'self' 才放行。
 *
 * ===================== ⚠ 已知缺口：深色模式会闪一帧白底 =====================
 *
 * 原型那版读 `localStorage['nola-demo-settings']`（原型设置落盘的地方）。
 * **主仓的设置在主进程** `userData/settings.json`，渲染层在 preload 就绪之前**读不到**，
 * 只能异步 `getSettings()` —— 而那时 splash 早就该画完了。
 *
 * 搬过来时原样保留这个读法会**永远读到 null**：不抛错、不打日志，只是每次冷启动
 * 都先闪一帧白底。
 *
 * **修法（已实现）**：主进程在 `settings.load()` 之后、建窗之前把 `theme` 拼进窗口的 query，
 *   页面在 <body> 解析前就能同步读到。选 query 而不是 `additionalArguments` 是因为本项目
 *   的渲染层开着 `contextIsolation: true` + `sandbox: true`，页面主世界拿不到 `window.process`
 *   —— 走 argv 会静默退回 `system`，白闪照旧。
 *
 * 现状（本文件）：从 `location.search` 取 `theme`，取不到就退回 `prefers-color-scheme`。
 * =========================================================================
 */
;(function () {
  var root = document.documentElement
  try {
    /*
     * 预涂的权威值，由主进程通过窗口 query 传进来。
     * 取不到时用 `system` 判一次，避免在没有设置的情况下硬编码成浅色。
     */
    var injected = new URLSearchParams(window.location.search).get('theme')
    var pref = injected === 'dark' || injected === 'light' ? injected : 'system'

    /*
     * HeroUI `useTheme` 的私有键。预涂必须把权威值镜像一份过去，否则 React 一挂载
     * `applyThemeToDOM()` 就把预涂的深色覆盖回它自己的默认值 —— 还是闪。
     * 主进程注入时不需要写 localStorage（file:// 下不可靠），直接等 HeroUI 接管即可。
     */
    if (injected !== null) {
      try { window.localStorage.setItem('heroui-theme', pref) } catch (e) { /* 忽略 */ }
    } else if (pref === 'system') {      try { window.localStorage.removeItem('heroui-theme') } catch (e) { /* 忽略 */ }
    }

    var dark =
      pref === 'dark' ||
      (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    root.classList.toggle('dark', dark)
    root.setAttribute('data-theme', dark ? 'dark' : 'light')
    // 冒烟测试靠这个标记确认"预涂真的在 CSP 下执行了"，而不是被静默拦掉。
    root.setAttribute('data-theme-booted', '1')

    /*
     * 悬浮字幕是独立文档分叉（?overlay=1），走的是另一套窗口几何：940x218 的窄条、
     * 独立加载、ready-to-show 才显示。启动画面在那种比例下只会莫名其妙，
     * 这里给 <html> 打标记，让 index.html 里的 #splash 用纯 CSS 隐藏。
     * 判据用 location.search 而不是读主进程传下来的变量：这个文件必须保持零依赖、零 IPC，
     * 且要在 <body> 解析之前跑完。
     */
    if (window.location.search.indexOf('overlay=1') !== -1) {
      root.classList.add('is-overlay')
    }
  } catch (e) {
    /* 预涂失败不阻断渲染：保持默认浅色总比白屏强 */
  }
})()
