export const shellZh = {
  overlay: '悬浮字幕',
  overlaySubtitle: '让实时翻译悬浮在桌面上',
  openOverlay: '打开悬浮字幕',
  captionPreview: '字幕预览',
  movable: '可拖动 · 可置顶',
  previewSource: 'The new interface helps us focus on the conversation.',
  previewTarget: '新的界面帮助我们专注于对话。',
  overlaySettings: '悬浮字幕设置',
  audioSource: '输入声源',
  audioSystem: '系统音频',
  languageDirection: '语言方向',
  showContent: '显示内容',
  layout: '字幕排版',
  appearance: '字幕外观设置',
  /**
   * 悬浮字幕窗那页的脚注。
   *
   * **不要写回「字幕窗口关闭后，同传可继续运行」** —— 那是原型时代的说法，那时关闭是
   * 纯隐藏。现在主进程的 `overlay:close`（`src/main/ipc.ts`）会**先停掉这场会话**再关窗，
   * 浮窗自己的关闭确认框（`overlay.closeBody`）也是这么说的。唯一不中断同传的收起方式是
   * 「最小化到任务栏」。文案必须跟着真实行为走，否则用户会以为关个窗就行，麦克风却还在录。
   */
  overlayHint: '关闭悬浮字幕窗会同时结束这场同传，想让它继续运行请用最小化。',
  errorOpening: '无法打开字幕窗口，请检查浏览器弹窗设置后重试。',
  minimize: '最小化',
  fullscreen: '全屏',
  /** 「系统默认输出」是协议里的伪声源（`{ kind: 'defaultOutput' }`），不是一台设备。 */
  defaultOutput: '系统默认输出',

  /**
   * 翻译失败的界面文案。**必须渲染，不能吞掉** —— 浮窗与工作台过去只画 `complete`，
   * 于是「断网 / key 过期 / 模型没就绪」和「还在翻译」长得一模一样，两种情况都是空白，
   * 用户什么也做不了。键是引擎的报错码（`type(error).__name__` 或固定语义码）。
   */
  translationFailed: '翻译失败 · {reason}',
  unknownReason: '未知原因',
  error: {
    URLError: '网络不可达',
    HTTPError: '接口返回错误',
    TimeoutError: '请求超时',
    translationTimeout: '翻译超时',
    resourceUnavailable: '翻译模型未安装',
    llamaServerUnavailable: '本地翻译服务未就绪',
    unsupportedLanguagePair: '不支持该语言组合',
    translationUnavailable: '翻译暂不可用',
    RuntimeError: '翻译服务返回异常',
    ValueError: '翻译参数无效',
    ConnectionError: '网络连接失败',
  },
} as const
/*
 * `error` 是嵌套对象，所以映射类型不能简单写成 `{ [K in keyof typeof shellZh]: string }`
 * —— 那会把 `error` 自己要求成 string，英文表里放对象就报 TS2322。
 * 这里逐层判断：值是字符串就映射成 string，否则（嵌套对象）映射成"每个叶子都是 string"。
 */
type EnOf<T> = { [K in keyof T]: T[K] extends string ? string : EnOf<T[K]> }
export const shellEn: EnOf<typeof shellZh> = {
  overlay: 'Floating captions',
  overlaySubtitle: 'Keep live translations visible on your desktop',
  openOverlay: 'Open floating captions',
  captionPreview: 'Caption preview',
  movable: 'Draggable · Always on top',
  previewSource: 'The new interface helps us focus on the conversation.',
  previewTarget: 'The new interface helps us focus on the conversation.',
  overlaySettings: 'Floating caption settings',
  audioSource: 'Audio source',
  audioSystem: 'System audio',
  languageDirection: 'Languages',
  showContent: 'Display',
  layout: 'Caption layout',
  appearance: 'Caption appearance',
  overlayHint: 'Closing the caption window also ends this session. Use Minimize to keep it running.',
  errorOpening: 'Could not open captions. Allow browser pop-ups and try again.',
  minimize: 'Minimize',
  fullscreen: 'Fullscreen',
  defaultOutput: 'System default output',
  translationFailed: 'Translation failed · {reason}',
  unknownReason: 'Unknown reason',
  error: {
    URLError: 'Network unreachable',
    HTTPError: 'The service returned an error',
    TimeoutError: 'The request timed out',
    translationTimeout: 'Translation timed out',
    resourceUnavailable: 'Translation model is not installed',
    llamaServerUnavailable: 'The local translation service is not ready',
    unsupportedLanguagePair: 'This language pair is not supported',
    translationUnavailable: 'Translation is temporarily unavailable',
    RuntimeError: 'The translation service returned an error',
    ValueError: 'Invalid translation parameters',
    ConnectionError: 'Could not connect',
  },
}
