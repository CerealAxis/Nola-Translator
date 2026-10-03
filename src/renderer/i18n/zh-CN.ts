/**
 * 中文词典。`en.ts` 的类型由本文件推导，缺 key 会在编译期报错。
 *
 * 文案纪律：
 * - 标题与说明不复述，说明只写用户不知道的信息
 * - 占位符不充当 label，占位符只在能减少输入错误时出现
 * - 不用破折号
 * - 错误信息三要素：发生了什么 / 用户能做什么 / 可复制的错误码
 */

import { shellZh } from './shell-ui'
import { homeRecordsZh } from './home-records-ui'
import { workspaceZh } from './workspace-ui'
import { modelsSettingsZh } from './models-settings-ui'

export const zhCN = {
  shellUi: shellZh,
  homeRecordsUi: homeRecordsZh,
  workspaceUi: workspaceZh,
  modelsSettingsUi: modelsSettingsZh,
  app: {
    name: 'Nola Translator',
  },

  nav: {
    home: '首页',
    workspace: '快速同传',
    records: '同传记录',
    models: '模型管理',
    settings: '设置',
  },

  titleBar: {
    engineReady: '引擎就绪',
    engineUnavailable: '引擎未启动',
    language: '界面语言',
    themeLight: '浅色',
    themeDark: '深色',
    themeSystem: '跟随系统',
    themeToLight: '切换到浅色',
    themeToDark: '切换到深色',
    helpMenu: '帮助菜单',
  },

  language: {
    zhCN: '简体中文',
    en: 'English',
  },

  home: {
    quickStart: '快速同传',
    overlayCaptions: '悬浮字幕',
    records: '同传记录',
    models: '模型管理',
    recentMeetings: '最近的同传',
    noMeetings: '还没有同传记录',
    noMeetingsAction: '开始第一场同传',
  },

  session: {
    title: '新建同传',
    name: '名称',
    namePlaceholder: '例：2026-03-05 周会',
    audioSource: '音频来源',
    audioSourceTest: '测试音频',
    testingAudio: '正在检测音频输入',
    sourceLanguage: '原文语言',
    targetLanguage: '译文语言',
    swapLanguages: '交换语言',
    recognitionModel: '识别模型',
    translateEnabled: '翻译已开启',
    translateDisabled: '翻译已关闭',
    keepAudio: '保存录音',
    keepAudioHint: '关闭后不保存音频，无法回放与导出。',
    cancel: '取消',
    next: '下一步',
    stepSetup: '设置',
    stepPreflight: '检查',
  },

  preflight: {
    title: '开始前检查',
    checkingDevices: '正在检测音频输入',
    checkingModels: '正在校验模型',
    deviceUnavailable: '没有检测到可用的音频输入',
    modelMissing: '缺少模型：{name}',
    installNow: '现在安装',
    later: '稍后再说',
    allReady: '检查通过',
    start: '开始同传',
  },

  workspace: {
    start: '开始同传',
    starting: '正在连接本地引擎',
    pause: '暂停',
    resume: '继续',
    paused: '已暂停',
    stop: '结束同传',
    stopping: '正在结束',
    endConfirm: '确认结束',
    endConfirmTitle: '结束这场同传？',
    endConfirmBody: '结束后会保存字幕和笔记，不能再回到实时视图。',
    keepGoing: '继续同传',
    end: '结束',
    displayMode: '显示内容',
    modeBoth: '双语对照',
    modeSource: '仅原文',
    modeTranslation: '仅译文',
    layout: '对照方式',
    layoutSplit: '分区对照',
    layoutSentence: '逐句对照',
    fontLarger: '放大字幕',
    fontSmaller: '缩小字幕',
    notes: '笔记',
    nothingYet: '还没有字幕',
    nothingYetHint: '开始同传后，识别到的语句会逐句出现在这里。',
    statusAutosave: '字幕逐句自动保存',
    statusDataSafe: '内容只存在这台电脑上',
    aiDisclosure: '译文由模型生成，可能有误。',
    sourcePanel: '实时转写',
    translationPanel: '翻译结果',
  },

  overlay: {
    title: '悬浮字幕',
    notStarted: '悬浮窗还没有内容',
    /*
     * 第二行是**译文轨道的位置**，所以这里放英文原文，不放中文提示语 ——
     * 中文提示语出现在译文那一侧会让人误以为翻译失败。
     */
    notStartedHint: 'Start a session to begin',
    micStart: '开始收音',
    micStop: '停止收音',
    micLoading: '正在准备识别引擎',
    pin: '置顶',
    unpin: '取消置顶',
    lock: '锁定位置与大小',
    unlock: '解锁位置与大小',
    displayMode: '显示内容',
    layout: '对照方式',
    position: '位置',
    minimize: '最小化到任务栏',
    close: '关闭悬浮窗',
    closeTitle: '关闭悬浮字幕窗？',
    closeBody: '会同时停止这场同传，字幕服务将不再收音。已保存的会议记录不受影响。',
    closeConfirm: '关闭并停止',
    closing: '正在停止…',
    closeFailed: '关闭失败，请重试。',
    style: '样式',
    size: '字号',
  },

  records: {
    title: '同传记录',
    subtitle: '查看和管理你的同传历史',
    search: '搜索记录',
    // 只能写「名称或语言」：`matches()`（`features/records/recordLogic.ts`）有意**不**搜
    // 字幕正文，列表载荷里也没有正文。写「按名称或原文搜索」会让用户拿记得的一句话去找
    // 一场会，得到一个「没有匹配的记录」——关于他自己数据的错误结论。
    searchPlaceholder: '按名称或语言搜索',
    noRecords: '还没有同传记录',
    noRecordsHint: '每场结束的同传都会自动存到这里。',
    startFirst: '开始第一场同传',
    noResults: '没有匹配的记录',
    noResultsHint: '换个关键词，或清空搜索条件。',
    clearSearch: '清空搜索',
    columnName: '名称',
    columnDuration: '时长',
    columnActions: '操作',
    view: '查看',
    rename: '重命名',
    delete: '删除',
    total: '共 {count} 条',
    goToPage: '前往第 {page} 页',
    detailSource: '原文',
    detailTranslation: '译文',
    export: '导出',
    exportTitle: '导出记录',
    exportConfirm: '导出',
    renameTitle: '重命名',
    renameLabel: '新名称',
    renameRequired: '名称不能为空',
    deleteTitle: '删除这条记录？',
    deleteBody: '字幕、译文和录音会一起删除，不能恢复。',
    audioUnavailable: '这场同传的录音没有保存',
    playerPlay: '播放',
    playerPause: '暂停',
  },

  notes: {
    title: '笔记',
    placeholder: 'Ctrl+B 加粗，Ctrl+I 斜体',
    bold: '加粗',
    italic: '斜体',
    underline: '下划线',
    strikethrough: '删除线',
  },

  models: {
    title: '模型管理',
    tabRecommended: '推荐',
    tabInstalled: '已安装',
    tabSearch: '搜索',
    tabDownloads: '下载中',
    asrModels: '语音识别',
    mtModels: '翻译',
    install: '安装',
    cancel: '取消下载',
    installed: '已安装',
    remove: '卸载',
    setDefault: '设为默认',
    notInstalled: '未安装',
    downloadFailed: '下载失败',
    retry: '重试',
    verifying: '正在校验',
    searchPlaceholder: '搜索模型名称或来源',
    filterAll: '全部',
    filterAsr: '语音识别',
    filterMt: '翻译',
    filterQuant: '量化',
    details: '模型详情',
    openDetails: '查看详情',
    noDescription: '暂无模型介绍',
    noResults: '没有匹配的模型',
    loadMore: '加载更多',
    loadMoreFailed: '后续模型加载失败，请重试。',
    noMoreResults: '已加载全部结果',
    viewOnHub: '在 Hugging Face 查看完整介绍',
    installFailed: '无法安装此模型，请查看诊断信息。',
    downloadsEmpty: '没有进行中的下载',
    downloadsEmptyHint: '去推荐或搜索里挑一个模型开始安装。',
    progress: '{percent}%',
    queued: '排队中',
    stateLabel: '状态',
    size: '大小',
    quantization: '量化',
    // 引擎逐个深检有上限，下面这句是如实交代"这不是全集"，不是免责声明。
    // 列表**不**按 compatible 过滤，装不了的也在屏幕上，所以"其中几个装得上"正是解释那一屏
    // 禁用按钮的那句话。{installable} 是判定过的那批里真装得上的条数（不受量化档影响）。
    searchTruncated: 'hub 上有 {candidates} 个候选，逐个检查了 {inspected} 个，其中 {installable} 个当前版本能安装，其余没有判定。',
    searchRateLimited: 'Hugging Face 限流，这次检查被提前打断，结果可能不完整。',
    // 空关键词不是"没搜"，是"浏览热门"。这两句存在的意义是别让用户把热门榜读成搜索结果。
    // 热门榜整榜都摆出来（包括当前版本装不上的），HF 的 ASR 榜（whisper/t5/wav2vec2）与
    // MT 榜（opus-mt）都是 encoder-decoder，引擎的 decoder-only 加载器一个都接不住 —— 所以
    // 能不能装由每张卡自己说，而不是把装不上的藏起来（藏起来的结果是浏览态恒为空态）。
    browsingHint: '搜索框是空的，下面按下载量列出 Hugging Face 的热门模型，不是搜索结果。能不能安装看每张卡上的说明。',
    browsingLoading: '正在拉取热门模型并逐个检查能不能安装，要联网读十几个仓库，通常要十几秒。',
    author: '发布者',
    taskType: '任务类型',
    architecture: 'GGUF 架构',
    loader: '加载器',
    fileCount: '文件数',
    verdictCode: '判定码',
    evidence: '判定依据',
    recheck: '重新判定',
    recheckFailed: '没有拿到新的判定，抽屉里那份仍然有效。',
    reasonCode: {
      adapterMatched: '匹配到已注册的适配器',
      llamaCppTranslationModel: 'llama.cpp 可以加载',
      noRegisteredAdapter: '没有匹配的适配器',
      unsupportedArchitecture: '引擎不支持这个架构',
      llamaCppUnsupportedArchitecture: 'llama.cpp 不支持这个 GGUF 架构',
      ggufArchitectureUnknown: '仓库没有声明 GGUF 架构',
      slotUnsupportedForLoader: '加载器与模型类别不符',
      ggufFileMissing: '仓库里没有 GGUF 权重',
      hubNoPublishedDigest: '权重没有可校验的摘要',
      whisperCppFormat: 'whisper.cpp 专有格式',
      hubGated: '受限仓库，未授权',
      hubPrivate: '私有仓库，未授权',
      repositoryInstallsDependencies: '仓库会顺带安装依赖',
      missingRequiredFiles: '缺少加载必需的文件',
      missingWeights: '只有配置文件，没有权重',
    },
  },

  settings: {
    title: '设置',
    groupAppearance: '外观',
    groupLanguage: '语言',
    theme: '主题',
    reduceMotion: '减少动效',
    uiLanguage: '界面语言',
    groupInput: '输入',
    groupRecognition: '识别',
    groupRecording: '录音',
    audioSource: '音频来源',
    testAudio: '测试音频',
    sourceLanguage: '原文语言',
    recognitionModel: '识别模型',
    keepAudio: '保存录音',
    keepAudioHint: '关闭后不保存音频，无法回放与导出。',
    groupProvider: '翻译服务',
    groupConnection: '连接',
    provider: '服务商',
    translateIntermediate: '中间语言',
    endpoint: '接口地址',
    region: '区域',
    model: '模型',
    apiKey: 'API 密钥',
    apiKeyPlaceholder: 'sk-...',
    saveKey: '保存密钥',
    deleteKey: '删除密钥',
    testing: '正在测试连接',
    // 分组名已经是「布局」，行标签再说一次「布局」就在同一屏里出现两个一样的词。
    // 行标签要说清它管的是哪一段排版：原文与译文怎么分区。
    captionLayout: '字幕排版',
    overlayPosition: '悬浮窗位置',
    positionFree: '自由摆放',
    positionTop: '屏幕顶部',
    positionBottom: '屏幕底部',
    overlayScheme: '悬浮窗配色',
    schemeDark: '深色',
    schemeLight: '浅色',
    fontFamily: '字体',
    sourceFontSize: '原文字号',
    translationFontSize: '译文字号',
    lineHeight: '行距',
    backgroundOpacity: '背景不透明度',
    backgroundColor: '背景颜色',
    sourceColor: '原文颜色',
    translationColor: '译文颜色',
    showSource: '显示原文',
    showTranslation: '显示译文',
    groupStorage: '存储',
    groupRestart: '重启',
    storagePath: '保存位置',
    browse: '浏览',
    restartRequired: '重启应用后生效',
    restartNow: '立即重启',
    groupEngine: '引擎',
    groupReport: '问题反馈',
    engineStatus: '引擎状态',
    engineVersion: '引擎版本',
    enginePath: '安装路径',
    protocolVersion: '通信协议',
    copyDiagnostics: '复制诊断信息',
    copied: '已复制',
    /** 诊断明细分组。旧前端的 `DiagnosticsPage` 只有这一项能力是设置页原先没有的。 */
    groupDiagnostics: '诊断明细',
    diagnosticsLoading: '正在读取…',
    diagnosticsFailed: '读取诊断信息失败',
    diagnosticsUnavailable: '诊断信息不可用',
    diagnosticsEmpty: '诊断信息为空',
    resetAll: '恢复出厂设置',
    resetAllTitle: '恢复出厂设置？',
    resetAllBody: '偏好设置会被清空，模型和记录保留。',
  },

  common: {
    cancel: '取消',
    confirm: '确定',
    close: '关闭',
    copied: '已复制',
    loading: '加载中',
    saved: '已保存',
    done: '完成',
  },

  status: {
    running: '进行中',
    error: '异常',
    downloading: '下载中',
    ok: '正常',
  },

  errors: {
    /*
     * 每条错误**只写一句完整的话**（发生了什么 + 错误码）。不要再补第二行"你该做什么"：
     * 第二行原本直接复用了按钮那一条，于是对话框里"重试启动"会连着出现两遍。
     * 按钮自己就是出路，正文再加一遍只是重复。
     */
    engineNotReady: '本地引擎没有运行，识别无法开始。错误码 ENG-001',
    // 预检状态不是失败：用户还没动手，所以不给错误码。
    engineNotReadyPreflight: '本地引擎没有运行，识别暂时无法开始。',
    // 会话中途引擎掉了。不能说"无法开始"——这场已经在跑了，说的是"停了"。
    engineStopped: '本地引擎已经停止，识别随之停止。',
    engineNotReadyAction: '重试启动',
    deviceNotFound: '没有找到可用的音频输入设备。错误码 AUD-002',
    deviceNotFoundAction: '检查系统声音设置',
    modelMissing: '识别模型还没有安装。错误码 MDL-003',
    modelMissingAction: '去安装模型',
    startFailed: '同传启动失败，音频通道没有打开。错误码 SES-004',
    startFailedAction: '重新开始同传',
    downloadFailed: '模型下载中断，已保留部分文件。错误码 NET-006',
    downloadFailedAction: '重试下载',
    searchFailed: '模型搜索暂不可用，下面不是搜索结果，Hugging Face 上未必没有这个模型。错误码 NET-006',
    searchFailedAction: '重试搜索',
    translateFailed: '翻译服务没有响应，只显示原文。错误码 MT-007',
    translateFailedAction: '检查密钥与网络',
    storageChanged: '保存位置已失效，字幕暂时写不进磁盘。错误码 STO-008',
    storageChangedAction: '重新选择保存位置',
    exportFailed: '导出失败，没有生成文件。错误码 EXP-009',
    // preload 没注入 = 这个窗口压根没接到引擎。给 UIP 而不是 ENG：引擎本身没坏，坏的是接线。
    engineNotConnected: '没有连上本地引擎，设置、记录和模型都读不到。错误码 UIP-011',
    pageCrashed: '界面渲染中断，同传仍在后台运行。错误码 UIP-010',
    pageCrashedAction: '重新载入界面',
    copyDiagnosticsAction: '复制诊断信息',
  },

  legal: {
    aiGeneratedRecord: '本条记录的译文由模型生成，仅供参考。',
    aiGeneratedExport: '本文件含模型生成的译文，重要场合请先核对。',
    // 这两条是产品级的常驻声明，工作台与记录详情共用，不要去借 workspace.* 的 key。
    statusAutosave: '记录自动保存',
    statusDataSafe: '数据保存在本机',
    license: '以 GPL-3.0 协议开源',
  },
} as const

/**
 * 放宽字面量类型，保留 key 结构。这样 `en` 填英文、中文源保留字面量，
 * 漏 key 或多 key 依然会在编译期报错。
 */
type Widen<T> = T extends string ? string : { readonly [K in keyof T]: Widen<T[K]> }

export type Dictionary = Widen<typeof zhCN>
