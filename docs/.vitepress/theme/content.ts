export const downloadUrl = 'https://github.com/CerealAxis/Nola-Translator/releases/latest'
// Provider icons are bundled from pan.quark.cn/favicon.ico and nd-static.bdstatic.com/m-static/wp-brand/favicon.ico.
// Replace these official share links when release share links are available.
export const downloadSources = [
  { id: 'quark', name: '夸克网盘', url: 'https://pan.quark.cn/s/ef1e11262087', icon: 'quark-pan.ico' },
  { id: 'baidu', name: '百度网盘', url: 'https://pan.baidu.com/s/1vq6wMwdJo_0FGo_lu6FfuA?pwd=kna2', icon: 'baidu-pan.ico' },
  { id: 'github', name: 'GitHub', url: downloadUrl, icon: null },
] as const
export const repositoryUrl = 'https://github.com/CerealAxis/Nola-Translator'
export const siteUrl = 'https://nola.xaviermc.top'
export const license = 'GPL-3.0'
export const localeNames = { 'zh-CN': '简体中文', 'zh-TW': '繁體中文（台灣）', 'zh-HK': '繁體中文（香港）', en: 'English', ja: '日本語', ko: '한국어' }
export type Locale = keyof typeof localeNames
export function localePath(locale: Locale) { return `/${locale}/` }

export interface LandingCopy {
  nav: { home: string; product: string; scenarios: string; download: string; docs: string; language: string; menu: string; skip: string; themeToLight: string; themeToDark: string }
  documentation: { outline: string; backToTop: string; editPage: string; lastUpdated: string; previous: string; next: string; home: string; search: string }
  hero: { title: string; subtitle: string; cta: string; note: string }
  demo: { hint: string; expand: string; close: string; reset: string; loading: string; title: string; intro: string; tabs: string[] }
  features: { title: string; body: string; tags: string[] }[]
  scenarios: { title: string; intro: string; items: { title: string; body: string; label: string }[] }
  platforms: { title: string; intro: string; soonLabel: string; desktop: string; desktopBody: string; browser: string; browserBody: string; terminal: string; terminalBody: string; extension: string }
  faq: { title: string; items: { question: string; answer: string }[] }
  final: { title: string; body: string; cta: string }
  footer: { tagline: string; releases: string; copyright: string }
}

/** Sidebar labels for the help documentation. Slugs live in config.ts; only display text is per-locale. */
export interface DocsNavCopy {
  root: string
  gettingStarted: string
  introduction: string
  downloadAndInstall: string
  environment: string
  localModels: string
  cloudModels: string
  features: string
  liveTranslation: string
  floatingCaptions: string
  browserCaptions: string
  settings: string
  troubleshooting: string
  feedback: string
  faq: string
  contributing: string
  howToContribute: string
  writingGuidelines: string
  developers: string
  developmentSetup: string
  gpgSigning: string
  api: string
  legal: string
  userAgreement: string
  privacyPolicy: string
}

export const copy: Record<Locale, LandingCopy> = {
  'zh-CN': {
    nav: { home: '首页', product: '产品', scenarios: '使用场景', download: '下载', docs: '文档', language: '选择语言', menu: '菜单', skip: '跳到内容', themeToLight: '切换到浅色模式', themeToDark: '切换到深色模式' },
    documentation: { outline: '目录', backToTop: '返回顶部', editPage: '在 GitHub 上编辑此页面', lastUpdated: '最后更新于', previous: '上一页', next: '下一页', home: '返回首页', search: '搜索' },
    hero: { title: '让每一种声音，都被听懂', subtitle: '从跨语言会议到外语视频，Nola Translator 把你听到的声音变成双语字幕。\n快速同传、悬浮字幕、浏览器字幕，用你喜欢的方式，听懂世界。', cta: '下载 Nola Translator', note: '免费开源 · 本地模型与云端模型' },
    demo: { hint: '试着点击侧栏，体验 Nola', expand: '展开体验', close: '退出全屏体验', reset: '重新体验', loading: '正在打开 Nola…', title: '一种声音，三种打开方式', intro: '会议里、屏幕上、播放器中。选择你的场景，看看 Nola 如何融入其中', tabs: ['快速同传', '悬浮字幕', '浏览器字幕'] },
    features: [
      { title: '专注交流\n让语言跟上你的思路', body: '系统音频或麦克风，原文与译文并排呈现。边听边记，把讨论中的重要想法留下来。会后，随时回到这场对话。', tags: ['实时双语字幕', '会议笔记', '同传记录'] },
      { title: '字幕跟着声音\n也跟着你的视线', body: '独立悬浮窗，放在你正在使用的应用上。调整字体、颜色和位置，让字幕自然融入会议、直播或外语课程。', tags: ['自由摆放', '双语对照', '外观自定义'] },
      { title: '搭配浏览器拓展\n支持视频内嵌显示字幕', body: '在 Chrome 或 Edge 中为网页视频生成字幕。原文与译文直接呈现在播放器里，外语视频也能轻松跟上。', tags: ['Chrome', 'Microsoft Edge', '播放器字幕'] },
      { title: '模型、引擎、设备\n选择权都在你手里', body: '本地模型与云端服务自由组合。llama.cpp 与 PyTorch，搭配 NVIDIA、Intel、AMD 显卡或 CPU，为你的设备选择合适的推理方式。具体支持随模型与运行组件而定。', tags: ['本地 / 云端', 'llama.cpp / PyTorch', 'GPU / CPU'] },
    ],
    scenarios: { title: '每一次听懂，都是新的连接', intro: '从今天的会议，到明天想看的那节课', items: [
      { title: '跨语言会议', body: '把注意力留给交流。双语字幕和会议笔记，让讨论与灵感一起留下来。', label: 'MEETING / 01' },
      { title: '直播与外语内容', body: '字幕浮在画面上，理解发生在当下。跟上直播、访谈和每一次分享。', label: 'LIVE / 02' },
      { title: '视频与在线课程', body: '在熟悉的浏览器里学习。对照原句、理解译文，让知识少一道语言门槛。', label: 'LEARNING / 03' },
    ] },
    platforms: { title: '在你习惯的地方，遇见 Nola', intro: '桌面、浏览器与终端，延续同一种体验', soonLabel: '即将开放下载', desktop: '桌面端', desktopBody: '完整的同传工作台、悬浮字幕与模型管理。', browser: '浏览器', browserBody: '在 Chrome 和 Edge 中，为网页视频生成双语字幕。', terminal: '终端', terminalBody: '通过命令行，将 Nola 接入你的工作流。', extension: '下载浏览器扩展' },
    faq: { title: '关于 Nola，你可能还想知道', items: [
      { question: 'Nola Translator 是免费的吗？', answer: 'Nola 是基于 GPL-3.0 协议的免费开源软件。本地推理无需 API 费用；使用云端服务时，费用和额度由对应服务提供方决定。' },
      { question: '需要什么配置的电脑？', answer: '当前 Windows 版本支持 x64 设备。你可以使用 CPU，也可以按模型和组件选择 NVIDIA、Intel 或 AMD 显卡。显存、内存需求随模型与量化方式而变化，配置较低时也可以选择云端服务。' },
      { question: '支持哪些语言？', answer: '界面支持简体中文、繁体中文（台湾 / 香港）、日语、韩语和英语。识别与翻译支持的语言由你选择的模型或云端服务决定，可在模型管理和语言选择中查看。' },
      { question: '网页 Demo 会使用我的麦克风吗？', answer: '不会。这里使用真实的软件界面和预设演示内容。你可以切换页面、调整字幕、编辑笔记和体验设置；实时识别与翻译请下载桌面版使用。' },
    ] },
    final: { title: '听懂世界\n从此刻开始', body: '让声音跨越语言，让交流回到交流。', cta: '下载 Windows 版' },
    footer: { tagline: '免费开源的实时翻译字幕软件', releases: '更新日志', copyright: '© 2026 Nola Translator' },
  },
  'zh-TW': {
    nav: { home: '首頁', product: '產品', scenarios: '使用情境', download: '下載', docs: '文件', language: '選擇語言', menu: '選單', skip: '跳到內容', themeToLight: '切換至淺色模式', themeToDark: '切換至深色模式' },
    documentation: { outline: '目錄', backToTop: '返回頂部', editPage: '在 GitHub 上編輯此頁面', lastUpdated: '最後更新於', previous: '上一頁', next: '下一頁', home: '返回首頁', search: '搜尋' },
    hero: { title: '聽懂每一種聲音', subtitle: '不論是跨語言會議，還是外語影片，Nola 都能把語音轉成雙語字幕。\n即時口譯、桌面浮動字幕或瀏覽器字幕，依照你的使用情境選擇。', cta: '下載 Nola Translator', note: '免費開源 · 本機模型與雲端模型' },
    demo: { hint: '點選側欄，探索 Nola', expand: '展開體驗', close: '退出全螢幕體驗', reset: '重新體驗', loading: '正在開啟 Nola…', title: '一種聲音，三種開啟方式', intro: '會議、桌面、播放器，都有適合的字幕方式。一起看看 Nola 怎麼融入你的日常。', tabs: ['即時口譯', '浮動字幕', '瀏覽器字幕'] },
    features: [
      { title: '專心參與對話\n字幕幫你跟上每個重點', body: '擷取系統音訊或麥克風聲音，原文與譯文並列顯示。邊聽邊記下重點，會後也能回看這場對話。', tags: ['即時雙語字幕', '會議筆記', '口譯紀錄'] },
      { title: '字幕顯示位置\n隨你的工作方式調整', body: '字幕會顯示在獨立視窗中，可放在常用應用程式上方。字體、顏色和位置都能調整，配合會議、直播或外語課程使用。', tags: ['自由擺放', '雙語對照', '自訂外觀'] },
      { title: '搭配瀏覽器擴充功能\n支援影片內嵌字幕', body: '在 Chrome 或 Edge 中為網頁影片產生字幕。原文與譯文直接呈現在播放器裡，外語影片也能輕鬆跟上。', tags: ['Chrome', 'Microsoft Edge', '播放器字幕'] },
      { title: '運算環境\n由你選擇', body: '本機模型與雲端服務可自由搭配，並依模型選用 llama.cpp 或 PyTorch，搭配 NVIDIA、Intel、AMD 顯示卡或 CPU。實際支援依模型與執行元件而定。', tags: ['本機 / 雲端', 'llama.cpp / PyTorch', 'GPU / CPU'] },
    ],
    scenarios: { title: '聽懂彼此，讓溝通更順暢', intro: '從今天的會議，到明天想看的那堂課', items: [{ title: '跨語言會議', body: '把注意力留給交流。雙語字幕和會議筆記，讓討論與靈感一起留下來。', label: 'MEETING / 01' }, { title: '直播與外語內容', body: '字幕浮在畫面上，理解發生在當下。跟上直播、訪談與每一次分享。', label: 'LIVE / 02' }, { title: '影片與線上課程', body: '在熟悉的瀏覽器裡學習。對照原句、理解譯文，讓知識少一道語言門檻。', label: 'LEARNING / 03' }] },
    platforms: { title: '在你習慣的地方，遇見 Nola', intro: '桌面、瀏覽器與終端，延續同一種體驗', soonLabel: '即將開放下載', desktop: '桌面版', desktopBody: '完整的口譯工作台、浮動字幕與模型管理。', browser: '瀏覽器', browserBody: '在 Chrome 和 Edge 中，為網頁影片產生雙語字幕。', terminal: '終端', terminalBody: '透過命令列，將 Nola 接入你的工作流程。', extension: '下載瀏覽器擴充功能' },
    faq: { title: '關於 Nola，你可能還想知道', items: [{ question: 'Nola Translator 是免費的嗎？', answer: 'Nola 是基於 GPL-3.0 的免費開源軟體。本機推論無需 API 費用；雲端服務的費用和額度由供應商決定。' }, { question: '需要什麼樣的電腦？', answer: '目前 Windows 版支援 x64 裝置。可使用 CPU，或依模型與元件選擇 NVIDIA、Intel、AMD 顯示卡。記憶體需求依模型與量化方式而異。' }, { question: '支援哪些語言？', answer: '介面支援簡體中文、繁體中文（台灣 / 香港）、日語、韓語和英語。辨識與翻譯語言依選擇的模型或雲端服務而定。' }, { question: '網頁 Demo 會使用我的麥克風嗎？', answer: '不會。此處使用真實軟體介面和預設示範內容，可切換頁面、調整字幕、編輯筆記。即時辨識與翻譯請下載桌面版。' }] },
    final: { title: '聽懂世界\n從此刻開始', body: '讓聲音跨越語言，讓交流回到交流。', cta: '下載 Windows 版' }, footer: { tagline: '免費開源的即時翻譯字幕軟體', releases: '更新紀錄', copyright: '© 2026 Nola Translator' },
  },
  'zh-HK': {
    nav: { home: '首頁', product: '產品', scenarios: '使用場景', download: '下載', docs: '說明文件', language: '選擇語言', menu: '選單', skip: '跳到內容', themeToLight: '切換至淺色模式', themeToDark: '切換至深色模式' },
    documentation: { outline: '目錄', backToTop: '返回頂部', editPage: '在 GitHub 上編輯此頁面', lastUpdated: '最後更新於', previous: '上一頁', next: '下一頁', home: '返回首頁', search: '搜尋' },
    hero: { title: '聽得明白，交流更順暢', subtitle: '不論是多語言會議，還是外語影片，Nola 都能將語音即時轉成雙語字幕。\n你可以選擇即時傳譯、懸浮字幕或瀏覽器字幕，按自己的習慣使用。', cta: '下載 Nola Translator', note: '免費開源 · 本機模型與雲端模型' },
    demo: { hint: '點選側欄，探索 Nola', expand: '展開體驗', close: '退出全螢幕體驗', reset: '重新體驗', loading: '正在開啟 Nola…', title: '一種聲音，三種開啟方式', intro: '無論在會議、桌面還是播放器，都有合適的字幕方式。看看 Nola 如何配合你的日常工作。', tabs: ['即時傳譯', '懸浮字幕', '瀏覽器字幕'] },
    features: [
      { title: '專心交流\n字幕幫你掌握重點', body: '擷取系統音訊或咪高峰聲音，原文和譯文並列顯示。邊聽邊記下重點，會後也能重溫對話。', tags: ['即時雙語字幕', '會議筆記', '傳譯記錄'] },
      { title: '字幕放在合適的位置\n視線不必離開畫面', body: '字幕會顯示在獨立視窗中，可放在常用應用程式上方。你可調整字體、顏色和位置，配合會議、直播或外語課程使用。', tags: ['自由擺放', '雙語對照', '自訂外觀'] },
      { title: '搭配瀏覽器擴充功能\n支援影片內嵌字幕', body: '在 Chrome 或 Edge 中為網頁影片產生字幕。原文與譯文直接呈現在播放器裡，外語影片也能輕鬆跟上。', tags: ['Chrome', 'Microsoft Edge', '播放器字幕'] },
      { title: '運算環境\n由你選擇', body: '本機模型與雲端服務可自由搭配，並依模型選用 llama.cpp 或 PyTorch，配合 NVIDIA、Intel、AMD 顯示卡或 CPU。實際支援視乎模型及執行元件而定。', tags: ['本機 / 雲端', 'llama.cpp / PyTorch', 'GPU / CPU'] },
    ],
    scenarios: { title: '聽得明白，彼此更靠近', intro: '由今日的會議，到下一堂想上的課', items: [{ title: '跨語言會議', body: '專心參與對話，雙語字幕和會議筆記會幫你記下討論和靈感。', label: 'MEETING / 01' }, { title: '直播與外語內容', body: '字幕跟隨畫面顯示，即時掌握內容。直播、訪談和每次分享都能輕鬆跟上。', label: 'LIVE / 02' }, { title: '影片與網上課程', body: '用熟悉的瀏覽器學習，對照原文和譯文，理解內容更輕鬆。', label: 'LEARNING / 03' }] },
    platforms: { title: '在你習慣的地方，遇見 Nola', intro: '桌面、瀏覽器與終端，延續同一種體驗', soonLabel: '即將開放下載', desktop: '桌面版', desktopBody: '完整的傳譯工作台、懸浮字幕與模型管理。', browser: '瀏覽器', browserBody: '在 Chrome 和 Edge 中，為網頁影片產生雙語字幕。', terminal: '終端', terminalBody: '透過命令列，將 Nola 接入你的工作流程。', extension: '下載瀏覽器擴充功能' },
    faq: { title: '關於 Nola，你可能想知道的事', items: [{ question: 'Nola Translator 是免費的嗎？', answer: 'Nola 是基於 GPL-3.0 的免費開源軟件。本機推論無需 API 費用；雲端服務的費用與額度由供應商決定。' }, { question: '電腦需要甚麼規格？', answer: '目前 Windows 版支援 x64 裝置。可使用 CPU，或依模型與元件選擇 NVIDIA、Intel、AMD 顯示卡。記憶體需求依模型與量化方式而異。' }, { question: '支援哪些語言？', answer: '介面支援簡體中文、繁體中文（台灣 / 香港）、日語、韓語與英語。辨識與翻譯語言依選擇的模型或雲端服務而定。' }, { question: '網頁 Demo 會使用我的咪高峰嗎？', answer: '不會。這裡使用真實軟件介面和預設示範內容，可切換頁面、調整字幕、編輯筆記。即時辨識與翻譯請下載桌面版。' }] },
    final: { title: '聽懂世界\n從此刻開始', body: '讓聲音跨越語言，讓對話自然流動。', cta: '下載 Windows 版' }, footer: { tagline: '免費開源的即時翻譯字幕軟件', releases: '更新記錄', copyright: '© 2026 Nola Translator' },
  },
  en: {
    nav: { home: 'Home', product: 'Product', scenarios: 'Use cases', download: 'Download', docs: 'Docs', language: 'Choose language', menu: 'Menu', skip: 'Skip to content', themeToLight: 'Switch to light mode', themeToDark: 'Switch to dark mode' },
    documentation: { outline: 'Contents', backToTop: 'Back to top', editPage: 'Edit this page on GitHub', lastUpdated: 'Last updated', previous: 'Previous page', next: 'Next page', home: 'Home', search: 'Search' },
    hero: { title: 'Understand every voice', subtitle: 'From multilingual meetings to videos in other languages, Nola turns speech into bilingual captions.\nFollow along with live translation, desktop caption overlays, and captions in your browser.', cta: 'Download Nola Translator', note: 'Free & open source · Local and cloud models' },
    demo: { hint: 'Explore Nola — try the sidebar', expand: 'Expand demo', close: 'Close expanded demo', reset: 'Restart demo', loading: 'Opening Nola…', title: 'One voice. Three ways to follow along', intro: 'For meetings, your desktop, or the video player. See how Nola fits the way you work.', tabs: ['Live translation', 'Caption overlay', 'Browser captions'] },
    features: [
      { title: 'Stay focused on the conversation\nLet captions keep up', body: 'Capture system audio or your microphone and read the original and translation side by side. Save key ideas in your notes and revisit them after the session.', tags: ['Bilingual captions', 'Session notes', 'Session history'] },
      { title: 'Captions where you need them\nAcross your screen', body: 'Keep a caption window above the apps you already use. Adjust its font, colors, and position for meetings, live streams, or language lessons.', tags: ['Flexible positioning', 'Both languages', 'Custom appearance'] },
      { title: 'With a browser extension\nCaptions right inside your video', body: 'Generate captions for web videos in Chrome or Edge. Read the original and translation right inside the player and keep up with content in another language.', tags: ['Chrome', 'Microsoft Edge', 'In-player captions'] },
      { title: 'Your models. Your runtimes.\nYour choice', body: 'Combine local models and cloud services. Run them with llama.cpp or PyTorch on supported NVIDIA, Intel, or AMD GPUs, or on a CPU. Support depends on the model and installed runtime.', tags: ['Local / Cloud', 'llama.cpp / PyTorch', 'GPU / CPU'] },
    ],
    scenarios: { title: 'Understand more. Connect better.', intro: 'From today’s meeting to the next class you want to take.', items: [{ title: 'Multilingual meetings', body: 'Stay focused on the conversation. Bilingual captions and session notes help you keep both the discussion and your ideas.', label: 'MEETING / 01' }, { title: 'Live streams & conversations', body: 'Follow the conversation as it happens, with captions over the video. Keep up with streams, interviews, and shared stories.', label: 'LIVE / 02' }, { title: 'Videos & online learning', body: 'Learn in the browser you know. Compare the original with its translation and spend less time working around language barriers.', label: 'LEARNING / 03' }] },
    platforms: { title: 'Nola, wherever you work', intro: 'On your desktop, in your browser, or from the terminal.', soonLabel: 'Downloads coming soon', desktop: 'Desktop', desktopBody: 'A complete live translation workspace, caption overlay, and model manager.', browser: 'Browser', browserBody: 'Bilingual captions for web videos in Chrome and Edge.', terminal: 'Terminal', terminalBody: 'Bring Nola into your workflow from the command line.', extension: 'Download browser extension' },
    faq: { title: 'Good to know', items: [{ question: 'Is Nola Translator free?', answer: 'Nola is free and open source under GPL-3.0. Local inference has no API fees. Cloud services set their own prices and quotas.' }, { question: 'What kind of computer do I need?', answer: 'The current Windows release supports x64 devices. Use a CPU or choose an NVIDIA, Intel, or AMD GPU according to your model and runtime. Memory requirements depend on the model and quantization.' }, { question: 'Which languages are supported?', answer: 'The interface supports Simplified Chinese, Traditional Chinese (Taiwan / Hong Kong), Japanese, Korean, and English. Recognition and translation languages depend on the model or cloud service you select.' }, { question: 'Does the demo use my microphone?', answer: 'No. This is the real application interface with preset demo content. Explore pages, change caption settings, and edit notes. Download the desktop app for live recognition and translation.' }] },
    final: { title: 'Go beyond language\nStart here', body: 'Understand more. Make every conversation count.', cta: 'Download for Windows' }, footer: { tagline: 'Free, open-source software for live translation and captions', releases: 'Changelog', copyright: '© 2026 Nola Translator' },
  },
  ja: {
    nav: { home: 'ホーム', product: '製品', scenarios: '活用シーン', download: 'ダウンロード', docs: 'ドキュメント', language: '言語を選択', menu: 'メニュー', skip: 'コンテンツへ', themeToLight: 'ライトモードに切り替え', themeToDark: 'ダークモードに切り替え' },
    documentation: { outline: '目次', backToTop: 'ページ上部へ戻る', editPage: 'GitHub でこのページを編集', lastUpdated: '最終更新', previous: '前のページ', next: '次のページ', home: 'ホームに戻る', search: '検索' },
    hero: { title: 'どんな声も、わかる言葉に。', subtitle: '多言語の会議も、外国語の動画も。聞こえてくる会話を二言語の字幕にします。\nリアルタイム通訳、字幕オーバーレイ、ブラウザー字幕で、いつものスタイルで理解をサポートします。', cta: 'Nola Translator をダウンロード', note: '無料・オープンソース · ローカルとクラウド' },
    demo: { hint: 'サイドバーから Nola を試してみましょう', expand: 'デモを拡大', close: '拡大表示を終了', reset: 'デモをリセット', loading: 'Nola を開いています…', title: 'ひとつの声。三つの使い方', intro: '会議でも、デスクトップでも、動画プレーヤーでも。Nola の使い方を試してみましょう。', tabs: ['リアルタイム通訳', '字幕オーバーレイ', 'ブラウザー字幕'] },
    features: [
      { title: '会話の流れを止めずに\n字幕で大切な内容を確認', body: 'システム音声やマイクの音声を、原文と訳文で並べて表示。大切な内容をメモに残し、セッション終了後にも振り返れます。', tags: ['二言語字幕', 'セッションメモ', 'セッション履歴'] },
      { title: '聞きたい場所に、字幕を。', body: 'いつものアプリの上に字幕ウィンドウを表示。フォントや色、位置を調整して、会議や配信、外国語の授業に合わせられます。', tags: ['自由な配置', '二言語表示', '外観の調整'] },
      { title: 'ブラウザー拡張と連携\n動画内に字幕を表示', body: 'Chrome や Edge の動画に字幕を生成。プレーヤーの中で原文と訳文を読み、外国語のコンテンツを楽しめます。', tags: ['Chrome', 'Microsoft Edge', '動画内の字幕'] },
      { title: 'モデルも実行環境も\n自分に合ったものを', body: 'ローカルモデルとクラウドサービスを自由に組み合わせ。llama.cpp や PyTorch を使い、対応する NVIDIA・Intel・AMD の GPU または CPU で実行できます。対応状況はモデルと実行環境によって異なります。', tags: ['ローカル / クラウド', 'llama.cpp / PyTorch', 'GPU / CPU'] },
    ],
    scenarios: { title: '言葉が通じると、つながりが広がる', intro: '今日の会議も、気になっていた講座も', items: [{ title: '多言語の会議', body: '会話に集中しながら、二言語字幕とメモで議論やアイデアを残せます。', label: 'MEETING / 01' }, { title: '配信と外国語コンテンツ', body: '動画に重ねた字幕で、その場で内容を理解。配信やインタビューも楽しめます。', label: 'LIVE / 02' }, { title: '動画とオンライン学習', body: 'いつものブラウザーで学習。原文と訳文を見比べながら、言葉の壁を越えましょう。', label: 'LEARNING / 03' }] },
    platforms: { title: 'いつもの場所で、Nola を。', intro: 'デスクトップでもブラウザーでも、いつもの Nola を。', soonLabel: 'ダウンロード近日公開', desktop: 'デスクトップ', desktopBody: 'リアルタイム通訳、字幕オーバーレイ、モデル管理をまとめて使えます。', browser: 'ブラウザー', browserBody: 'Chrome と Edge のウェブ動画に二言語字幕を表示します。', terminal: 'ターミナル', terminalBody: 'コマンドラインから Nola をワークフローに。', extension: 'ブラウザー拡張をダウンロード' },
    faq: { title: 'Nola について', items: [{ question: '無料で使えますか？', answer: 'Nola は GPL-3.0 の無料オープンソースソフトウェアです。ローカル推論の API 料金はありません。クラウドの料金や上限は各サービスによります。' }, { question: 'どんなパソコンが必要ですか？', answer: '現在の Windows 版は x64 対応です。CPU またはモデルとランタイムに対応する NVIDIA・Intel・AMD GPU を使用できます。必要なメモリはモデルと量子化方式によります。' }, { question: '対応言語は？', answer: '画面表示は簡体字中国語、繁体字中国語（台湾・香港）、日本語、韓国語、英語に対応しています。認識・翻訳言語は選択したモデルやクラウドサービスによります。' }, { question: 'デモはマイクを使いますか？', answer: '使いません。実際のアプリ画面にデモデータを表示しています。ページ切替、字幕設定、メモ編集を体験できます。音声認識と翻訳にはデスクトップ版をご利用ください。' }] },
    final: { title: '言葉の壁を越えて\nここから始めよう', body: '声を理解し、会話をもっと自然に。', cta: 'Windows 版をダウンロード' }, footer: { tagline: '無料・オープンソースのリアルタイム翻訳・字幕ソフトウェア', releases: '更新履歴', copyright: '© 2026 Nola Translator' },
  },
  ko: {
    nav: { home: '홈', product: '제품', scenarios: '활용 사례', download: '다운로드', docs: '문서', language: '언어 선택', menu: '메뉴', skip: '본문으로 이동', themeToLight: '라이트 모드로 전환', themeToDark: '다크 모드로 전환' },
    documentation: { outline: '목차', backToTop: '맨 위로 이동', editPage: 'GitHub에서 이 페이지 편집', lastUpdated: '마지막 업데이트', previous: '이전 페이지', next: '다음 페이지', home: '홈으로 돌아가기', search: '검색' },
    hero: { title: '언어의 장벽 없이, 모든 목소리를 이해하세요', subtitle: '다국어 회의부터 외국어 영상까지, 들리는 대화를 두 언어 자막으로 확인하세요.\n실시간 통역, 자막 오버레이, 브라우저 자막으로 익숙한 방식대로 내용을 이해할 수 있습니다.', cta: 'Nola Translator 다운로드', note: '무료 오픈 소스 · 로컬 및 클라우드 모델' },
    demo: { hint: '사이드바에서 Nola를 둘러보세요', expand: '데모 확대', close: '확대 보기 종료', reset: '데모 다시 시작', loading: 'Nola 여는 중…', title: '하나의 목소리, 세 가지 방식', intro: '회의에서도, 데스크톱에서도, 동영상 플레이어에서도. 내 작업 방식에 맞는 Nola를 확인해 보세요.', tabs: ['실시간 통역', '자막 오버레이', '브라우저 자막'] },
    features: [
      { title: '대화의 흐름을 놓치지 마세요', body: '시스템 오디오나 마이크 소리를 원문과 번역으로 나란히 확인하세요. 중요한 내용은 메모에 남기고 세션이 끝난 뒤에도 다시 살펴볼 수 있습니다.', tags: ['이중 언어 자막', '세션 메모', '세션 기록'] },
      { title: '원하는 곳에서 보는 자막', body: '사용 중인 앱 위에 자막 창을 띄우세요. 글꼴, 색상, 위치를 조절해 회의, 방송, 외국어 수업에 맞출 수 있습니다.', tags: ['자유로운 배치', '두 언어 비교', '모양 설정'] },
      { title: '브라우저 확장과 함께\n영상 안에 자막 표시', body: 'Chrome이나 Edge에서 웹 영상 자막을 생성하세요. 플레이어 안에서 원문과 번역을 읽으며 외국어 콘텐츠를 따라갈 수 있습니다.', tags: ['Chrome', 'Microsoft Edge', '플레이어 자막'] },
      { title: '모델과 실행 환경을\n원하는 대로 선택하세요', body: '로컬 모델과 클라우드 서비스를 조합하세요. 지원되는 NVIDIA·Intel·AMD GPU 또는 CPU에서 llama.cpp나 PyTorch로 실행할 수 있습니다. 지원 여부는 모델과 설치된 런타임에 따라 다릅니다.', tags: ['로컬 / 클라우드', 'llama.cpp / PyTorch', 'GPU / CPU'] },
    ],
    scenarios: { title: '더 잘 이해할수록, 더 넓어지는 연결', intro: '오늘의 회의부터 다음에 듣고 싶은 강의까지', items: [{ title: '다국어 회의', body: '대화에 집중하세요. 이중 언어 자막과 세션 메모로 논의와 아이디어를 함께 남길 수 있습니다.', label: 'MEETING / 01' }, { title: '방송과 외국어 콘텐츠', body: '영상 위 자막으로 그 순간의 내용을 이해하세요. 방송과 인터뷰도 놓치지 않고 따라갈 수 있습니다.', label: 'LIVE / 02' }, { title: '영상과 온라인 학습', body: '익숙한 브라우저에서 배우세요. 원문과 번역을 비교하며 언어 장벽을 줄일 수 있습니다.', label: 'LEARNING / 03' }] },
    platforms: { title: '익숙한 곳에서 Nola를 만나세요', intro: '데스크톱에서도, 브라우저에서도, 터미널에서도 Nola를 사용하세요.', soonLabel: '다운로드 곧 공개', desktop: '데스크톱', desktopBody: '실시간 통역, 자막 오버레이, 모델 관리를 한곳에서.', browser: '브라우저', browserBody: 'Chrome과 Edge의 웹 영상에 이중 언어 자막을 표시합니다.', terminal: '터미널', terminalBody: '명령줄에서 Nola를 작업 흐름에 연결하세요.', extension: '브라우저 확장 다운로드' },
    faq: { title: 'Nola에 대해 궁금한 점', items: [{ question: '무료인가요?', answer: 'Nola는 GPL-3.0 무료 오픈 소스 소프트웨어입니다. 로컬 추론은 API 비용이 없으며, 클라우드 가격과 할당량은 서비스 제공자가 정합니다.' }, { question: '어떤 컴퓨터가 필요한가요?', answer: '현재 Windows 버전은 x64를 지원합니다. CPU 또는 모델과 런타임에 맞는 NVIDIA·Intel·AMD GPU를 사용할 수 있습니다. 메모리 요구량은 모델과 양자화 방식에 따라 다릅니다.' }, { question: '어떤 언어를 지원하나요?', answer: '인터페이스는 简体中文, 繁體中文（台灣）, 繁體中文（香港）, 日本語, 한국어, English를 지원합니다. 인식과 번역 언어는 선택한 모델이나 클라우드에 따라 다릅니다.' }, { question: '데모에서 마이크를 사용하나요?', answer: '아니요. 실제 앱 화면에 사전 설정된 데모 데이터를 표시합니다. 페이지 전환, 자막 설정, 메모 편집을 체험할 수 있습니다. 실시간 인식과 번역은 데스크톱 앱에서 이용하세요.' }] },
    final: { title: '언어의 장벽을 넘어\n여기서 시작하세요', body: '더 잘 이해하고, 대화를 이어가세요.', cta: 'Windows 버전 다운로드' }, footer: { tagline: '무료 오픈 소스 실시간 번역 및 자막 소프트웨어', releases: '업데이트 기록', copyright: '© 2026 Nola Translator' },
  },
}

export const docsNav: Record<Locale, DocsNavCopy> = {
  'zh-CN': {
    root: 'Nola Translator 帮助文档',
    gettingStarted: '开始入门', introduction: '产品介绍', downloadAndInstall: '下载与安装', environment: '环境配置', localModels: '本地模型配置', cloudModels: '云端模型配置',
    features: '功能介绍', liveTranslation: '快速同传', floatingCaptions: '悬浮字幕', browserCaptions: '浏览器字幕', settings: '系统设定',
    troubleshooting: '疑难解答', feedback: '如何反馈', faq: '常见问题',
    contributing: '参与贡献', howToContribute: '如何贡献', writingGuidelines: '编写规范',
    developers: '开发者指南', developmentSetup: '开发环境配置', gpgSigning: 'GPG 签名配置', api: 'API 文档',
    legal: '软件协议', userAgreement: '用户协议', privacyPolicy: '隐私协议',
  },
  'zh-TW': {
    root: 'Nola Translator 說明文件',
    gettingStarted: '開始使用', introduction: '產品介紹', downloadAndInstall: '下載與安裝', environment: '環境設定', localModels: '本機模型設定', cloudModels: '雲端模型設定',
    features: '功能介紹', liveTranslation: '即時口譯', floatingCaptions: '浮動字幕', browserCaptions: '瀏覽器字幕', settings: '系統設定',
    troubleshooting: '疑難排解', feedback: '意見回饋', faq: '常見問題',
    contributing: '參與貢獻', howToContribute: '如何貢獻', writingGuidelines: '編寫規範',
    developers: '開發者指南', developmentSetup: '開發環境設定', gpgSigning: 'GPG 簽章設定', api: 'API 文件',
    legal: '軟體協定', userAgreement: '使用者條款', privacyPolicy: '隱私權政策',
  },
  'zh-HK': {
    root: 'Nola Translator 說明文件',
    gettingStarted: '快速入門', introduction: '產品介紹', downloadAndInstall: '下載與安裝', environment: '環境設定', localModels: '本機模型設定', cloudModels: '雲端模型設定',
    features: '功能介紹', liveTranslation: '即時傳譯', floatingCaptions: '懸浮字幕', browserCaptions: '瀏覽器字幕', settings: '系統設定',
    troubleshooting: '疑難排解', feedback: '提交意見', faq: '常見問題',
    contributing: '參與貢獻', howToContribute: '如何貢獻', writingGuidelines: '編寫規範',
    developers: '開發者指南', developmentSetup: '開發環境設定', gpgSigning: 'GPG 簽署設定', api: 'API 文件',
    legal: '軟體協議', userAgreement: '使用者條款', privacyPolicy: '私隱政策',
  },
  en: {
    root: 'Nola Translator Documentation',
    gettingStarted: 'Getting Started', introduction: 'Product Overview', downloadAndInstall: 'Download and Install', environment: 'Environment Setup', localModels: 'Local Models', cloudModels: 'Cloud Models',
    features: 'Features', liveTranslation: 'Live Translation', floatingCaptions: 'Caption Overlay', browserCaptions: 'Browser Captions', settings: 'Settings',
    troubleshooting: 'Troubleshooting', feedback: 'Reporting Issues', faq: 'FAQ',
    contributing: 'Contributing', howToContribute: 'How to Contribute', writingGuidelines: 'Writing Guidelines',
    developers: 'Developer Guide', developmentSetup: 'Development Setup', gpgSigning: 'GPG Signing', api: 'API Reference',
    legal: 'Legal', userAgreement: 'Terms of Service', privacyPolicy: 'Privacy Policy',
  },
  ja: {
    root: 'Nola Translator ヘルプ',
    gettingStarted: 'はじめに', introduction: '製品概要', downloadAndInstall: 'ダウンロードとインストール', environment: '環境設定', localModels: 'ローカルモデル設定', cloudModels: 'クラウドモデル設定',
    features: '機能紹介', liveTranslation: 'リアルタイム翻訳', floatingCaptions: '字幕オーバーレイ', browserCaptions: 'ブラウザー字幕', settings: 'システム設定',
    troubleshooting: 'トラブルシューティング', feedback: '問題の報告', faq: 'よくある質問',
    contributing: '貢献する', howToContribute: '貢献の方法', writingGuidelines: '執筆ガイドライン',
    developers: '開発者ガイド', developmentSetup: '開発環境構築', gpgSigning: 'GPG 署名設定', api: 'API リファレンス',
    legal: 'ライセンス', userAgreement: '利用規約', privacyPolicy: 'プライバシーポリシー',
  },
  ko: {
    root: 'Nola Translator 문서',
    gettingStarted: '시작하기', introduction: '제품 소개', downloadAndInstall: '다운로드 및 설치', environment: '환경 설정', localModels: '로컬 모델 설정', cloudModels: '클라우드 모델 설정',
    features: '기능 소개', liveTranslation: '실시간 통역', floatingCaptions: '자막 오버레이', browserCaptions: '브라우저 자막', settings: '시스템 설정',
    troubleshooting: '문제 해결', feedback: '문제 신고', faq: '자주 묻는 질문',
    contributing: '기여하기', howToContribute: '기여 방법', writingGuidelines: '작성 규칙',
    developers: '개발자 가이드', developmentSetup: '개발 환경 설정', gpgSigning: 'GPG 서명 설정', api: 'API 문서',
    legal: '법적 고지', userAgreement: '이용약관', privacyPolicy: '개인정보 처리방침',
  },
}
