export const downloadUrl = 'https://github.com/CerealAxis/Nola-Translator/releases/latest'
export const repositoryUrl = 'https://github.com/CerealAxis/Nola-Translator'
export const license = 'GPL-3.0'
export const localeNames = { 'zh-CN': '简体中文', 'zh-TW': '繁體中文（台灣）', 'zh-HK': '繁體中文（香港）', en: 'English', ja: '日本語', ko: '한국어' }
export type Locale = keyof typeof localeNames
export function localePath(locale: Locale) { return locale === 'zh-CN' ? '/' : `/${locale}/` }

export interface LandingCopy {
  nav: { product: string; scenarios: string; download: string; docs: string; language: string; menu: string; skip: string }
  hero: { title: string; subtitle: string; cta: string; note: string }
  demo: { hint: string; expand: string; close: string; reset: string; loading: string; title: string; intro: string; tabs: string[] }
  features: { title: string; body: string; tags: string[] }[]
  scenarios: { title: string; intro: string; items: { title: string; body: string; label: string }[] }
  platforms: { title: string; intro: string; soonLabel: string; desktop: string; desktopBody: string; browser: string; browserBody: string; terminal: string; terminalBody: string; extension: string }
  faq: { title: string; items: { question: string; answer: string }[] }
  final: { title: string; body: string; cta: string }
  footer: { tagline: string; releases: string; copyright: string }
}

export const copy: Record<Locale, LandingCopy> = {
  'zh-CN': {
    nav: { product: '产品', scenarios: '使用场景', download: '下载', docs: '文档', language: '选择语言', menu: '导航菜单', skip: '跳到内容' },
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
    nav: { product: '產品', scenarios: '使用情境', download: '下載', docs: '文件', language: '選擇語言', menu: '導覽選單', skip: '跳到內容' },
    hero: { title: '讓每一種聲音，都被聽懂', subtitle: '從跨語言會議到外語影片，Nola Translator 把你聽到的聲音變成雙語字幕。\n即時口譯、浮動字幕、瀏覽器字幕，用你喜歡的方式，聽懂世界。', cta: '下載 Nola Translator', note: '免費開源 · 本機模型與雲端模型' },
    demo: { hint: '試著點選側欄，體驗 Nola', expand: '展開體驗', close: '退出全螢幕體驗', reset: '重新體驗', loading: '正在開啟 Nola…', title: '一種聲音，三種開啟方式', intro: '會議裡、螢幕上、播放器中。選擇你的情境，看看 Nola 如何融入其中', tabs: ['即時口譯', '浮動字幕', '瀏覽器字幕'] },
    features: [
      { title: '專注交流\n讓語言跟上你的思路', body: '系統音訊或麥克風，原文與譯文並排呈現。邊聽邊記，留下討論中的重要想法。會後，隨時回到這場對話。', tags: ['即時雙語字幕', '會議筆記', '口譯紀錄'] },
      { title: '字幕跟著聲音\n也跟著你的視線', body: '獨立浮動視窗，放在正在使用的應用程式上。調整字體、顏色和位置，讓字幕融入會議、直播或外語課程。', tags: ['自由擺放', '雙語對照', '自訂外觀'] },
      { title: '搭配瀏覽器擴充功能\n支援影片內嵌字幕', body: '在 Chrome 或 Edge 中為網頁影片產生字幕。原文與譯文直接呈現在播放器裡，外語影片也能輕鬆跟上。', tags: ['Chrome', 'Microsoft Edge', '播放器字幕'] },
      { title: '模型、引擎、裝置\n選擇權都在你手裡', body: '本機模型與雲端服務自由組合。llama.cpp 與 PyTorch，搭配 NVIDIA、Intel、AMD 顯示卡或 CPU。實際支援依模型與執行元件而定。', tags: ['本機 / 雲端', 'llama.cpp / PyTorch', 'GPU / CPU'] },
    ],
    scenarios: { title: '每一次聽懂，都是新的連結', intro: '從今天的會議，到明天想看的那堂課', items: [{ title: '跨語言會議', body: '把注意力留給交流。雙語字幕和會議筆記，讓討論與靈感一起留下來。', label: 'MEETING / 01' }, { title: '直播與外語內容', body: '字幕浮在畫面上，理解發生在當下。跟上直播、訪談與每一次分享。', label: 'LIVE / 02' }, { title: '影片與線上課程', body: '在熟悉的瀏覽器裡學習。對照原句、理解譯文，讓知識少一道語言門檻。', label: 'LEARNING / 03' }] },
    platforms: { title: '在你習慣的地方，遇見 Nola', intro: '桌面、瀏覽器與終端，延續同一種體驗', soonLabel: '即將開放下載', desktop: '桌面版', desktopBody: '完整的口譯工作台、浮動字幕與模型管理。', browser: '瀏覽器', browserBody: '在 Chrome 和 Edge 中，為網頁影片產生雙語字幕。', terminal: '終端', terminalBody: '透過命令列，將 Nola 接入你的工作流程。', extension: '下載瀏覽器擴充功能' },
    faq: { title: '關於 Nola，你可能還想知道', items: [{ question: 'Nola Translator 是免費的嗎？', answer: 'Nola 是基於 GPL-3.0 的免費開源軟體。本機推論無需 API 費用；雲端服務的費用和額度由供應商決定。' }, { question: '需要什麼配置的電腦？', answer: '目前 Windows 版支援 x64 裝置。可使用 CPU，或依模型與元件選擇 NVIDIA、Intel、AMD 顯示卡。記憶體需求依模型與量化方式而異。' }, { question: '支援哪些語言？', answer: '介面支援簡體中文、繁體中文（台灣 / 香港）、日語、韓語和英語。辨識與翻譯語言依選擇的模型或雲端服務而定。' }, { question: '網頁 Demo 會使用我的麥克風嗎？', answer: '不會。此處使用真實軟體介面和預設示範內容，可切換頁面、調整字幕、編輯筆記。即時辨識與翻譯請下載桌面版。' }] },
    final: { title: '聽懂世界\n從此刻開始', body: '讓聲音跨越語言，讓交流回到交流。', cta: '下載 Windows 版' }, footer: { tagline: '免費開源的即時翻譯字幕軟體', releases: '更新紀錄', copyright: '© 2026 Nola Translator' },
  },
  'zh-HK': {
    nav: { product: '產品', scenarios: '使用場景', download: '下載', docs: '文件', language: '選擇語言', menu: '導覽選單', skip: '跳到內容' },
    hero: { title: '讓每一種聲音，都被聽懂', subtitle: '從跨語言會議到外語影片，Nola Translator 將你聽到的聲音變成雙語字幕。\n即時傳譯、懸浮字幕、瀏覽器字幕，用你喜歡的方式，聽懂世界。', cta: '下載 Nola Translator', note: '免費開源 · 本機模型與雲端模型' },
    demo: { hint: '試試點選側欄，體驗 Nola', expand: '展開體驗', close: '退出全螢幕體驗', reset: '重新體驗', loading: '正在開啟 Nola…', title: '一種聲音，三種開啟方式', intro: '會議裡、螢幕上、播放器中。選擇你的場景，看看 Nola 如何融入其中', tabs: ['即時傳譯', '懸浮字幕', '瀏覽器字幕'] },
    features: [
      { title: '專注交流\n讓語言跟上你的思路', body: '系統音訊或咪高峰，原文與譯文並排呈現。一邊聽一邊記，留下討論中的重要想法。會後隨時重溫對話。', tags: ['即時雙語字幕', '會議筆記', '傳譯記錄'] },
      { title: '字幕跟着聲音\n也跟着你的視線', body: '獨立懸浮視窗，放在正在使用的應用程式上。調整字體、顏色和位置，讓字幕融入會議、直播或外語課程。', tags: ['自由擺放', '雙語對照', '自訂外觀'] },
      { title: '搭配瀏覽器擴充功能\n支援影片內嵌字幕', body: '在 Chrome 或 Edge 中為網頁影片產生字幕。原文與譯文直接呈現在播放器裡，外語影片也能輕鬆跟上。', tags: ['Chrome', 'Microsoft Edge', '播放器字幕'] },
      { title: '模型、引擎、裝置\n選擇權都在你手裡', body: '本機模型與雲端服務自由組合。llama.cpp 與 PyTorch，搭配 NVIDIA、Intel、AMD 顯示卡或 CPU。實際支援依模型與執行元件而定。', tags: ['本機 / 雲端', 'llama.cpp / PyTorch', 'GPU / CPU'] },
    ],
    scenarios: { title: '每一次聽懂，都是新的連結', intro: '從今天的會議，到明天想看的那堂課', items: [{ title: '跨語言會議', body: '把注意力留給交流。雙語字幕與會議筆記，讓討論和靈感一起留下來。', label: 'MEETING / 01' }, { title: '直播與外語內容', body: '字幕浮在畫面上，理解發生在當下。跟上直播、訪談和每一次分享。', label: 'LIVE / 02' }, { title: '影片與網上課程', body: '在熟悉的瀏覽器裡學習。對照原句、理解譯文，讓知識少一道語言門檻。', label: 'LEARNING / 03' }] },
    platforms: { title: '在你習慣的地方，遇見 Nola', intro: '桌面、瀏覽器與終端，延續同一種體驗', soonLabel: '即將開放下載', desktop: '桌面版', desktopBody: '完整的傳譯工作台、懸浮字幕與模型管理。', browser: '瀏覽器', browserBody: '在 Chrome 和 Edge 中，為網頁影片產生雙語字幕。', terminal: '終端', terminalBody: '透過命令列，將 Nola 接入你的工作流程。', extension: '下載瀏覽器擴充功能' },
    faq: { title: '關於 Nola，你可能還想知道', items: [{ question: 'Nola Translator 是免費的嗎？', answer: 'Nola 是基於 GPL-3.0 的免費開源軟件。本機推論無需 API 費用；雲端服務的費用與額度由供應商決定。' }, { question: '需要甚麼配置的電腦？', answer: '目前 Windows 版支援 x64 裝置。可使用 CPU，或依模型與元件選擇 NVIDIA、Intel、AMD 顯示卡。記憶體需求依模型與量化方式而異。' }, { question: '支援哪些語言？', answer: '介面支援簡體中文、繁體中文（台灣 / 香港）、日語、韓語與英語。辨識與翻譯語言依選擇的模型或雲端服務而定。' }, { question: '網頁 Demo 會使用我的咪高峰嗎？', answer: '不會。這裡使用真實軟件介面和預設示範內容，可切換頁面、調整字幕、編輯筆記。即時辨識與翻譯請下載桌面版。' }] },
    final: { title: '聽懂世界\n從此刻開始', body: '讓聲音跨越語言，讓交流回到交流。', cta: '下載 Windows 版' }, footer: { tagline: '免費開源的即時翻譯字幕軟件', releases: '更新記錄', copyright: '© 2026 Nola Translator' },
  },
  en: {
    nav: { product: 'Product', scenarios: 'Use cases', download: 'Download', docs: 'Docs', language: 'Choose language', menu: 'Navigation', skip: 'Skip to content' },
    hero: { title: 'Every voice. Understood', subtitle: 'From multilingual meetings to videos in another language, turn what you hear into bilingual captions.\nLive translation, floating captions, and browser captions. Your way into the conversation.', cta: 'Download Nola Translator', note: 'Free & open source · Local and cloud models' },
    demo: { hint: 'Explore Nola — try the sidebar', expand: 'Expand demo', close: 'Close expanded demo', reset: 'Restart demo', loading: 'Opening Nola…', title: 'One voice. Three ways to follow', intro: 'In meetings, on your desktop, inside your player. Find your setting and make yourself at home', tabs: ['Live translation', 'Floating captions', 'Browser captions'] },
    features: [
      { title: 'Stay in the conversation\nLet language catch up', body: 'Capture system audio or your microphone. Read both languages side by side, keep useful ideas in your notes, and return to the conversation afterwards.', tags: ['Bilingual captions', 'Meeting notes', 'Session history'] },
      { title: 'Where the sound goes\nyour captions follow', body: 'A floating window over the apps you already use. Adjust the type, colors, and position to fit a meeting, live stream, or language lesson.', tags: ['Flexible positioning', 'Both languages', 'Custom appearance'] },
      { title: 'With a browser extension\nCaptions right inside your video', body: 'Generate captions for web videos in Chrome or Edge. Read the original and translation right inside the player and keep up with content in another language.', tags: ['Chrome', 'Microsoft Edge', 'In-player captions'] },
      { title: 'Your models. Your engines\nYour choice', body: 'Combine local models and cloud services. Use llama.cpp and PyTorch with NVIDIA, Intel, AMD GPUs or a CPU. Availability depends on the model and installed runtime.', tags: ['Local / Cloud', 'llama.cpp / PyTorch', 'GPU / CPU'] },
    ],
    scenarios: { title: 'Understanding opens a new connection', intro: 'From today’s meeting to tomorrow’s lesson', items: [{ title: 'Multilingual meetings', body: 'Keep your attention on the people. Bilingual captions and meeting notes keep the discussion and the ideas together.', label: 'MEETING / 01' }, { title: 'Live streams & conversations', body: 'Captions over the picture, understanding in the moment. Follow streams, interviews, and every story worth sharing.', label: 'LIVE / 02' }, { title: 'Videos & online learning', body: 'Learn in the browser you know. Compare the original and translation, with one less barrier to knowledge.', label: 'LEARNING / 03' }] },
    platforms: { title: 'Meet Nola where you already work', intro: 'Desktop, browser, and terminal. One familiar experience', soonLabel: 'Downloads coming soon', desktop: 'Desktop', desktopBody: 'Your complete translation workspace, floating captions, and model manager.', browser: 'Browser', browserBody: 'Bilingual captions for web videos in Chrome and Edge.', terminal: 'Terminal', terminalBody: 'Bring Nola into your workflow from the command line.', extension: 'Download browser extension' },
    faq: { title: 'A few things you might want to know', items: [{ question: 'Is Nola Translator free?', answer: 'Nola is free and open source under GPL-3.0. Local inference has no API fees. Cloud services set their own prices and quotas.' }, { question: 'What hardware do I need?', answer: 'The current Windows release supports x64 devices. Use a CPU or choose an NVIDIA, Intel, or AMD GPU according to your model and runtime. Memory requirements depend on the model and quantization.' }, { question: 'Which languages are supported?', answer: 'The interface supports Simplified Chinese, Traditional Chinese (Taiwan / Hong Kong), Japanese, Korean, and English. Recognition and translation languages depend on the model or cloud service you select.' }, { question: 'Does this demo access my microphone?', answer: 'No. This is the real application interface with preset demo content. Explore pages, change caption settings, and edit notes. Download the desktop app for live recognition and translation.' }] },
    final: { title: 'A world to understand\nStart listening', body: 'Let voices cross languages. Let conversations flow.', cta: 'Download for Windows' }, footer: { tagline: 'Free, open-source real-time translation and caption software', releases: 'Changelog', copyright: '© 2026 Nola Translator' },
  },
  ja: {
    nav: { product: '製品', scenarios: '活用シーン', download: 'ダウンロード', docs: 'ドキュメント', language: '言語を選択', menu: 'ナビゲーション', skip: 'コンテンツへ' },
    hero: { title: 'すべての声を、理解へ', subtitle: '多言語の会議から外国語の動画まで、聞こえる声を二言語の字幕に。\nリアルタイム翻訳、フローティング字幕、ブラウザー字幕。あなたの方法で世界を理解する。', cta: 'Nola Translator をダウンロード', note: '無料・オープンソース · ローカルとクラウド' },
    demo: { hint: 'サイドバーを選んで Nola を体験', expand: 'デモを拡大', close: '拡大表示を終了', reset: 'デモをリセット', loading: 'Nola を開いています…', title: 'ひとつの声。三つの使い方', intro: '会議、デスクトップ、プレーヤー。あなたの場面に合う Nola を見つけてください', tabs: ['リアルタイム翻訳', 'フローティング字幕', 'ブラウザー字幕'] },
    features: [
      { title: '会話に集中\n言葉は、あとからついてくる', body: 'システム音声やマイクから、原文と訳文を並べて表示。聞きながら大切なアイデアをメモし、会議のあとにも振り返れます。', tags: ['二言語字幕', '会議メモ', '翻訳履歴'] },
      { title: '音声とともに\n字幕も視線の先へ', body: 'いつものアプリの上に浮かぶ独立ウィンドウ。書体、色、位置を調整して、会議や配信、外国語の授業に合わせられます。', tags: ['自由な配置', '二言語表示', '外観の調整'] },
      { title: 'ブラウザー拡張と連携\n動画内に字幕を表示', body: 'Chrome や Edge の動画に字幕を生成。プレーヤーの中で原文と訳文を読み、外国語のコンテンツを楽しめます。', tags: ['Chrome', 'Microsoft Edge', '動画内の字幕'] },
      { title: 'モデルもエンジンも\n選ぶのはあなた', body: 'ローカルモデルとクラウドを組み合わせる。llama.cpp と PyTorch、NVIDIA・Intel・AMD の GPU や CPU に対応。利用条件はモデルとランタイムによって異なります。', tags: ['ローカル / クラウド', 'llama.cpp / PyTorch', 'GPU / CPU'] },
    ],
    scenarios: { title: '理解するたび、新しいつながり', intro: '今日の会議から、明日見たい授業まで', items: [{ title: '多言語の会議', body: '人との会話に集中。二言語字幕と会議メモで、議論もアイデアも残せます。', label: 'MEETING / 01' }, { title: '配信と外国語コンテンツ', body: '映像の上に字幕を。その場で理解し、配信やインタビューを楽しめます。', label: 'LIVE / 02' }, { title: '動画とオンライン学習', body: 'いつものブラウザーで学ぶ。原文と訳文を比べて、言語の壁をひとつ減らします。', label: 'LEARNING / 03' }] },
    platforms: { title: 'いつもの場所で、Nola に出会う', intro: 'デスクトップ、ブラウザー、ターミナル。同じ使いやすさを', soonLabel: 'ダウンロード近日公開', desktop: 'デスクトップ', desktopBody: '翻訳ワークスペース、フローティング字幕、モデル管理。', browser: 'ブラウザー', browserBody: 'Chrome と Edge のウェブ動画に二言語字幕を。', terminal: 'ターミナル', terminalBody: 'コマンドラインから Nola をワークフローに。', extension: 'ブラウザー拡張をダウンロード' },
    faq: { title: 'Nola について、よくある質問', items: [{ question: '無料で使えますか？', answer: 'Nola は GPL-3.0 の無料オープンソースソフトウェアです。ローカル推論の API 料金はありません。クラウドの料金や上限は各サービスによります。' }, { question: '必要なパソコンの構成は？', answer: '現在の Windows 版は x64 対応です。CPU またはモデルとランタイムに対応する NVIDIA・Intel・AMD GPU を使用できます。必要なメモリはモデルと量子化方式によります。' }, { question: '対応言語は？', answer: '画面は簡体字、繁体字（台湾・香港）、日本語、韓国語、英語に対応。認識・翻訳言語は選択したモデルやクラウドサービスによります。' }, { question: 'デモはマイクを使いますか？', answer: '使いません。実際のアプリ画面にデモデータを表示しています。ページ切替、字幕設定、メモ編集を体験できます。音声認識と翻訳にはデスクトップ版をご利用ください。' }] },
    final: { title: '世界を理解する\n今、ここから', body: '言葉を越えて、会話をもっと自由に。', cta: 'Windows 版をダウンロード' }, footer: { tagline: '無料・オープンソースのリアルタイム翻訳字幕ソフトウェア', releases: '更新履歴', copyright: '© 2026 Nola Translator' },
  },
  ko: {
    nav: { product: '제품', scenarios: '활용 사례', download: '다운로드', docs: '문서', language: '언어 선택', menu: '탐색 메뉴', skip: '본문으로 이동' },
    hero: { title: '모든 목소리를, 이해하다', subtitle: '다국어 회의부터 외국어 영상까지, 들리는 소리를 두 언어의 자막으로.\n실시간 통역, 플로팅 자막, 브라우저 자막. 나만의 방식으로 세상을 이해하세요.', cta: 'Nola Translator 다운로드', note: '무료 오픈 소스 · 로컬 및 클라우드 모델' },
    demo: { hint: '사이드바를 눌러 Nola를 체험하세요', expand: '데모 확대', close: '확대 보기 종료', reset: '데모 다시 시작', loading: 'Nola 여는 중…', title: '하나의 목소리, 세 가지 방식', intro: '회의에서, 데스크톱에서, 플레이어 안에서. 내 상황에 맞는 Nola를 만나보세요', tabs: ['실시간 통역', '플로팅 자막', '브라우저 자막'] },
    features: [
      { title: '대화에 집중하세요\n언어는 흐름을 따라옵니다', body: '시스템 오디오나 마이크를 통해 원문과 번역을 나란히 읽으세요. 중요한 생각을 메모하고, 회의가 끝난 뒤에도 대화를 돌아볼 수 있습니다.', tags: ['이중 언어 자막', '회의 메모', '통역 기록'] },
      { title: '소리가 있는 곳에\n자막도 함께', body: '사용 중인 앱 위에 독립된 창을 띄우세요. 글꼴, 색상, 위치를 조절하여 회의, 방송, 외국어 수업에 맞출 수 있습니다.', tags: ['자유로운 배치', '두 언어 비교', '모양 설정'] },
      { title: '브라우저 확장과 함께\n영상 안에 자막 표시', body: 'Chrome이나 Edge에서 웹 영상 자막을 생성하세요. 플레이어 안에서 원문과 번역을 읽으며 외국어 콘텐츠를 따라갈 수 있습니다.', tags: ['Chrome', 'Microsoft Edge', '플레이어 자막'] },
      { title: '모델도, 엔진도\n선택은 당신의 몫', body: '로컬 모델과 클라우드 서비스를 조합하세요. llama.cpp와 PyTorch, NVIDIA·Intel·AMD GPU 또는 CPU를 선택할 수 있습니다. 실제 지원은 모델과 런타임에 따라 다릅니다.', tags: ['로컬 / 클라우드', 'llama.cpp / PyTorch', 'GPU / CPU'] },
    ],
    scenarios: { title: '이해할 때마다, 새로운 연결', intro: '오늘의 회의부터 내일 듣고 싶은 강의까지', items: [{ title: '다국어 회의', body: '사람과의 대화에 집중하세요. 이중 언어 자막과 회의 메모로 논의와 아이디어를 함께 남깁니다.', label: 'MEETING / 01' }, { title: '방송과 외국어 콘텐츠', body: '영상 위에 자막, 그 순간의 이해. 방송과 인터뷰, 모든 이야기를 따라가세요.', label: 'LIVE / 02' }, { title: '영상과 온라인 학습', body: '익숙한 브라우저에서 배우세요. 원문과 번역을 비교하며 언어의 장벽을 하나 줄입니다.', label: 'LEARNING / 03' }] },
    platforms: { title: '익숙한 곳에서 Nola를 만나세요', intro: '데스크톱, 브라우저, 터미널. 하나의 익숙한 경험', soonLabel: '다운로드 곧 공개', desktop: '데스크톱', desktopBody: '통역 작업 공간, 플로팅 자막, 모델 관리까지.', browser: '브라우저', browserBody: 'Chrome과 Edge의 웹 영상에 이중 언어 자막을.', terminal: '터미널', terminalBody: '명령줄에서 Nola를 작업 흐름에 연결하세요.', extension: '브라우저 확장 다운로드' },
    faq: { title: 'Nola에 대해 더 알고 싶다면', items: [{ question: '무료인가요?', answer: 'Nola는 GPL-3.0 무료 오픈 소스 소프트웨어입니다. 로컬 추론은 API 비용이 없으며, 클라우드 가격과 할당량은 서비스 제공자가 정합니다.' }, { question: '어떤 컴퓨터가 필요한가요?', answer: '현재 Windows 버전은 x64를 지원합니다. CPU 또는 모델과 런타임에 맞는 NVIDIA·Intel·AMD GPU를 사용할 수 있습니다. 메모리 요구량은 모델과 양자화 방식에 따라 다릅니다.' }, { question: '어떤 언어를 지원하나요?', answer: '인터페이스는 중국어 간체·번체(대만 / 홍콩), 일본어, 한국어, 영어를 지원합니다. 인식과 번역 언어는 선택한 모델이나 클라우드에 따라 다릅니다.' }, { question: '데모에서 마이크를 사용하나요?', answer: '아니요. 실제 앱 화면에 사전 설정된 데모 데이터를 표시합니다. 페이지 전환, 자막 설정, 메모 편집을 체험할 수 있습니다. 실시간 인식과 번역은 데스크톱 앱에서 이용하세요.' }] },
    final: { title: '세상을 이해하는 시작\n바로 지금', body: '목소리가 언어를 넘어, 대화가 자연스럽게.', cta: 'Windows 버전 다운로드' }, footer: { tagline: '무료 오픈 소스 실시간 번역 자막 소프트웨어', releases: '업데이트 기록', copyright: '© 2026 Nola Translator' },
  },
}
