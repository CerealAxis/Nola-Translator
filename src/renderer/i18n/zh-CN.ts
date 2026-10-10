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

import { browserZh } from './browser-ui'
import { runtimeZh } from './runtime-ui'
import { computeUi } from '../features/settings/compute-ui'
export const zhCN = {
  browser: browserZh,
  runtime: runtimeZh,
  compute: computeUi.zh,
  modelConfig: {
    title: '配置模型', pending: '待配置', edit: '编辑配置', configure: '配置并启用',
    description: '确认模型用途、运行引擎及语言能力。保存完整配置后，才能在同传中选择这个模型。',
    slot: '模型用途', recognition: '语音识别', translation: '翻译', engine: '运行引擎',
    languages: '支持的识别语言', autoDetection: '支持自动检测语言', sourceLanguages: '支持的源语言', targetLanguages: '支持的目标语言',
    restrictPairs: '限定翻译方向', pairsHint: '关闭时，允许已选源语言与目标语言的所有组合；开启时，仅允许下方列出的方向。',
    addPair: '添加方向', removePair: '移除方向', invalid: '请选择支持的语言；限定方向时，至少添加一个有效方向。',
    save: '保存配置', saveFailed: '配置保存失败，请核对模型用途、引擎和支持的语言。', saved: '模型配置已保存',
    incompatibleTitle: '当前翻译模型不支持此语言方向',
    incompatibleBody: '{name} 不支持 {source} → {target} 的翻译。可以更换翻译模型、更换识别语言，或者关闭翻译并只输出原文。',
    changeModel: '更换翻译模型', changeLanguage: '更换识别语言', disableTranslation: '关闭翻译',
    needsConfiguration: '模型尚未配置，请前往模型管理完成配置。', modelHelp: '用途和引擎必须与模型文件及软件支持的加载方式一致。',
    selectLanguages: '选择语言', sourceUnsupported: '当前识别模型不支持所选语言，请重新选择。',
  },
  shellUi: shellZh,
  homeRecordsUi: homeRecordsZh,
  workspaceUi: workspaceZh,
  modelsSettingsUi: modelsSettingsZh,
  app: {
    name: 'Nola Translator',
  },
  appUpdate: {
    group: '软件更新', versionCheck: '版本检查', versionCheckHint: '从 GitHub 获取当前版本和最新稳定版信息。',
    checkNow: '检查更新', availableStatus: '发现新版本 {version}', upToDateStatus: '已是最新版本 {version}',
    checkFailed: '暂时无法从 GitHub 获取版本信息，请稍后重试。',
    title: '发现新版本', version: '最新版本 {version}', currentVersion: '当前版本 {version}',
    notes: '更新内容', notesUnavailable: '此版本没有提供更新说明。',
    openRelease: '查看 GitHub 下载页', later: '稍后提醒', openFailed: '无法打开 GitHub 发布页，请检查网络后重试。',
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
    engineIdle: '引擎未启动',
    engineStarting: '引擎启动中',
    engineRecovering: '引擎重连中',
    engineFailed: '引擎启动失败',
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
    nameHelpAria: '名称说明',
    nameHint: '这个框里显示的是系统会给你这场会起的名字（按开始时间和当天的场次算）。保持原样就用它；改写它就成为这场会的自定义名称。',
    audioSource: '音频来源',
    sourceLanguage: '原文语言',
    targetLanguage: '译文语言',
    translation: '翻译',
    translationLanguage: '翻译语言',
    translationModel: '翻译模型',
    swapLanguages: '交换语言',
    recognitionModel: '识别模型',
    keepAudio: '保存录音',
    keepAudioHint: '关闭后不保存音频，无法回放与导出。录音会随这场会议保存在本机，结束后可以在记录详情里回放。',
    cancel: '取消',
    start: '开始',
    stepPreflight: '检查',
  },

  preflight: {
    title: '开始前检查',
    checkingDevices: '正在检测音频输入',
    checkingModels: '正在校验模型',
    deviceUnavailable: '没有检测到可用的音频输入',
    /**
     * 设备行在"引擎没答上话"时的读法。**这一条故意不写任何设备相关的结论**：
     * 探设备那一次调用同时兼着启动引擎，引擎起不来时它没能探成，报"没有检测到可用的音频
     * 输入"就是把引擎故障说成硬件故障。真原因由 `errors.engineNotReady`（ENG-001）承担。
     */
    deviceCheckBlocked: '音频输入检测未能完成',
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
    sourcePanel: '实时转写',
    translationPanel: '翻译结果',
  },

  videoCaptions: {
    title: '视频字幕',
    experimentalTitle: '实验性功能',
    experimentalBody: '视频字幕功能正在开发中，如有问题可反馈至 Github issue。',
    experimentalAction: '去反馈',
    captionPreview: '字幕预览',
    settings: '视频字幕设置',
    openBrowser: '打开浏览器',
    audioSource: '输入声源',
    tabAudio: '标签页声音',
    systemAudio: '系统音频',
    browserAppearance: '浏览器字幕外观设置',
    enableService: '开启字幕服务',
    disableService: '关闭字幕服务',
    serviceLoading: '正在加载模型',
    serviceReady: '字幕服务已就绪',
    // 按钮旁边的常驻指示，只在闸门开着时出现：开着但没有会话 = 已就绪，
    // 开着且有会话 = 扩展正在用它（转圈）。关着的时候按钮本身就是唯一信号，不再加文字。
    serviceRunning: '浏览器正在生成字幕',
    serviceFailed: '字幕服务开启失败',
    errorOpeningBrowser: '无法打开默认浏览器，请在系统里设置一个默认浏览器后重试。错误码 UIP-017',
    /*
     * 预览里的示例句：第一行原文、第二行译文，双语对照就长这样。
     * 用一句真实语料而不是 lorem —— 占位文本看不出换行与字号对不对。
     */
    previewSource: '这是视频里正在播放的那句话。',
    previewTranslation: 'This is the line playing in the video.',
  },

  overlay: {
    title: '悬浮字幕',
    notStarted: '请点击下方的麦克风按钮开始字幕识别',
    /*
     * 第二行落在**译文轨道的位置**上，所以这一行即使在中文界面下也保持英文
     * （`Click the microphone button below to start captioning`），不放中文提示语 ——
     * 中文提示语出现在译文那一侧会让人误以为翻译失败。
     */
    notStartedHint: 'Click the microphone button below to start captioning',
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
    perPage: '每页',
    pageSize: '每页数量',
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
    selectAllPage: '全选本页',
    selectRecord: '选择 {name}',
    selectedCount: '已选 {count} 条',
    clearSelection: '取消选择',
    deleteSelected: '删除所选 {count} 条',
    deleteManyTitle: '删除这 {count} 条记录？',
    deleteManyBody: '这些记录的字幕、译文和录音会一起删除，不能恢复。',
    deletedMany: '已删除 {count} 条记录',
    deletePartialFailed: '已删除 {removed} 条，{failed} 条失败',
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
    searchPlaceholder: '搜索Hugging Face上的模型',
    experimentalNoticeTitle: '实验性功能',
    experimentalNoticeBody: '模型来自 Hugging Face 社区，能否安装和识别效果都不保证。',
    experimentalNoticeAction: '去看推荐模型',
    filterAll: '全部',
    filterAsr: '语音识别',
    filterMt: '翻译',
    filterQuant: '量化',
    details: '模型详情',
    openDetails: '查看详情',
    noDescription: '暂无模型介绍',
    descriptions: {
      qwenAsr17: '支持中文、英语、粤语等 30 种语言及 22 种中文方言语音识别。',
      qwenAsr06: '支持中文、英语、粤语等 30 种语言及 22 种中文方言语音识别。',
      senseVoice: '支持普通话、粤语、英语、日语和韩语语音识别与语言检测。',
      hyMt2Q4: 'Q4_K_M 量化版本；支持 33 种语言互译，另含藏语、哈萨克语、蒙古语、维吾尔语和粤语。',
      hyMt2Q3: 'Q3_K_M 量化版本；支持 33 种语言互译，另含藏语、哈萨克语、蒙古语、维吾尔语和粤语。',
      hyMt2Iq2: 'UD-IQ2_M 量化版本；支持 33 种语言互译，另含藏语、哈萨克语、蒙古语、维吾尔语和粤语。',
      m2m100: '支持中文、英语等 100 种语言互译。',
    },
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
    loadFailed: '无法读取设置',
    title: '设置',
    groupAppearance: '外观',
    groupLanguage: '语言',
    /*
     * 网络这一组按「谁负责加速哪一段下载」拆开：代理是一次性的通道，两个镜像各管一个上游，
     * GitHub 前缀只补镜像覆盖不到的组件下载。地址与前缀留空都等于关闭，所以下面三条代理开关
     * 在地址为空时是禁用状态。
     */
    groupNetwork: '网络设置',
    proxyUrl: '代理服务器地址',
    proxyUrlHint: '留空表示不使用代理，填写地址后下面三项开关才生效，例如 http://127.0.0.1:7890',
    proxyForPip: '将代理应用到 Pip',
    proxyForModelDownload: '将代理应用到模型下载',
    proxyForRuntimeDownload: '将代理应用到组件下载',
    pypiMirror: 'PyPI 国内镜像',
    pypiMirrorHint: '通过国内镜像下载 Python 软件包',
    huggingFaceMirror: 'Huggingface 国内镜像',
    huggingFaceMirrorHint: '通过国内镜像下载 Huggingface 模型',
    githubAccelerate: 'GitHub 加速',
    githubAccelerateHint: '未镜像的组件下载加速；留空表示不加速，填写后拼在下载地址前，例如 https://ghfast.top',
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
    /*
     * 翻译服务商只剩三个。**「本地模型」「云端模型」是界面概念，不是产品名**：
     * Hy-MT2 与 M2M100 合并成前者（真正跑哪个由选中的模型 id 决定），
     * OpenAI 与 Ollama 合并成后者（Ollama 从此只是一种接口协议，不是服务商）。
     * 所以这两行必须跟着界面语言走；产品名只剩 Microsoft Translator 一个。
     */
    providerLocal: '本地模型',
    providerCloud: '云端模型',
    providerMicrosoft: 'Microsoft Translator',
    groupLocalModel: '选择使用的本地模型',
    localModelEmpty: '尚未安装本地翻译模型，请先到「模型管理」下载。',
    /*
     * 云端那七项。**API 格式决定接口地址该填到哪一层**（Anthropic 只填站点根地址，
     * 其余填到 /v1），所以每种格式各带一句提示 —— 层级填错最难从报错里看出来。
     */
    apiFormat: 'API 格式',
    apiFormatChatCompletions: 'Chat Completions (/v1/chat/completions)',
    apiFormatChatResponses: 'Chat Responses (/v1/responses)',
    apiFormatAnthropic: 'Anthropic Messages (/v1/messages)',
    apiFormatOllama: 'Ollama (/api/chat)',
    endpointHintChatCompletions: '填到 /v1 为止，例如 https://api.example.com/v1',
    endpointHintChatResponses: '填到 /v1 为止；请求会发往 /v1/responses',
    endpointHintAnthropic: '只填站点根地址，不要带 /v1 或 /v1/messages，例如 https://api.anthropic.com',
    endpointHintOllama: '本机 Ollama 地址，例如 http://127.0.0.1:11434',
    apiName: '名称',
    apiNamePlaceholder: '如：智谱 GLM',
    endpointPlaceholder: 'https://api.example.com/v1',
    // 行标签是「模型 ID」而不是「模型」：这一栏填的是服务商那边的模型标识（gpt-4.1-mini），
    // 填厂商名（OpenAI）是最常见也最没意义的填法，标签要先把这件事说清楚。
    modelId: '模型 ID',
    contextWindow: '上下文窗口',
    maxOutputTokens: '最大输出 Token',
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
    groupAbout: '关于',
    engineStatus: '引擎状态',
    engineVersion: '引擎版本',
    enginePath: '安装路径',
    protocolVersion: '通信协议',
    copyDiagnostics: '复制诊断信息',
    copied: '已复制',
    githubIssue: 'GitHub issue',
    githubIssueHint: '在这里提交问题与需求',
    openInBrowser: '用浏览器打开',
    qqGroup: 'QQ 群',
    thirdPartyNotices: '打开源许可证',
    thirdPartyNoticesHint: '本应用使用的第三方开源项目与许可协议',
    viewNotices: '查看',
    noticesTitle: '第三方开源许可',
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
    // **当前没有界面在用这一条**：冷启动不再报「引擎没运行」（主进程在 app ready 时就启动
    // 引擎，应用刚打开那几秒是 `booting`，什么都没坏，报故障等于报一件没发生的事）；
    // 引擎真的起不来走的是上面 `engineNotReady`（带 ENG-001）+ `engineNotReadyAction`。
    // 留着是因为 `i18n.test.ts` 的 `noCodeByDesign` 点名了这一条，删掉会让那条断言的注释悬空。
    engineNotReadyPreflight: '本地引擎没有运行，识别暂时无法开始。',
    // 会话中途引擎掉了。不能说"无法开始"——这场已经在跑了，说的是"停了"。
    engineStopped: '本地引擎已经停止，识别随之停止。',
    /*
     * 引擎进程在同传途中没了（`sessionStore` 的 `ENGINE_LOST`）。与上面 `engineStopped`
     * 的区别是**引擎自己会不会回来**：那一条说的是会话级的停止，这一条说的是进程没了，
     * 而重连出来的是新进程，这场会一定回不来 —— 所以出路是"去那条记录"，不是"重试"。
     * 字幕逐句落盘（主进程 `meetings.append`），所以"已保存"这句话是实情。
     */
    engineLost: '本地引擎在同传中停止，这场同传已中断，已经识别到的字幕已保存。错误码 ENG-002',
    engineLostAction: '查看这场记录',
    engineNotReadyAction: '重试启动',
    deviceNotFound: '没有找到可用的音频输入设备。错误码 AUD-002',
    deviceNotFoundAction: '检查系统声音设置',
    modelMissing: '识别模型还没有安装。错误码 MDL-003',
    modelMissingAction: '去安装模型',
    startFailed: '同传未能启动，请检查所选模型、计算设备和运行环境。错误码 SES-004',
    startFailedAction: '重新开始同传',
    downloadFailed: '模型下载中断，已保留部分文件。错误码 NET-006',
    downloadFailedAction: '重试下载',
    searchFailed: '模型搜索暂不可用，下面不是搜索结果，Hugging Face 上未必没有这个模型。错误码 NET-006',
    searchFailedAction: '重试搜索',
    translateFailed: '翻译服务没有响应，只显示原文。错误码 MT-007',
    translateFailedAction: '检查密钥与网络',
    storageChanged: '保存位置已失效，字幕暂时写不进磁盘。错误码 STO-008',
    storageChangedAction: '重新选择保存位置',
    // 设置保存失败的真实原因。主进程只有被文件系统拒绝写入时才会失败，所以界面按 errno 分派；
    // 认不出 errno 时只能说「没能保存」，不能像 `storageChanged` 那样断言保存位置已经失效。
    // 编号接着全局序列往下排，全局最后一个是 `videoCaptions.errorOpeningBrowser` 的 UIP-017。
    settingsWriteDenied: '没有写入设置的权限，这次改动没能保存。错误码 STO-018',
    settingsFileLocked: '设置文件正被其他程序占用，这次改动没能保存。错误码 STO-019',
    settingsDiskFull: '磁盘空间不足，这次改动没能保存。错误码 STO-020',
    settingsSaveFailed: '这次改动没能保存，请重试。错误码 STO-021',
    exportFailed: '导出失败，没有生成文件。错误码 EXP-009',
    // preload 没注入 = 这个窗口压根没接到引擎。给 UIP 而不是 ENG：引擎本身没坏，坏的是接线。
    engineNotConnected: '没有连上本地引擎，设置、记录和模型都读不到。错误码 UIP-011',
    pageCrashed: '界面渲染中断，同传仍在后台运行。错误码 UIP-010',
    pageCrashedAction: '重新载入界面',
    copyDiagnosticsAction: '复制诊断信息',

    /*
     * 字幕服务闸门操作失败。域前缀用 UIP：这两条里引擎、模型、存储、网络和翻译都是好的，
     * 坏的是桌面端自己那条开关 / 停会话的调用，所以和 `engineNotConnected`、`errorOpeningBrowser`
     * 归在一起。编号接着全局序列往下排，全局最后一个是 `settingsSaveFailed` 的 STO-021。
     */
    captionServiceToggleFailed: '字幕服务的开关没有切换成功，请重试。错误码 UIP-022',
    captionServiceStopFailed: '字幕服务已关闭，但有一场字幕会话没能结束，识别可能还在继续。错误码 UIP-023',

    /*
     * 预热被引擎拒绝的原因。每条都要说清现在该做什么：只写「加载失败」的话，
     * 用户既不知道是模型没装、是模型不支持这组语言，还是有别的东西正占着模型。
     * 编号接着全局序列往下排（005 空缺，011 是最后一个），域前缀用 MDL ——
     * 这五条都是模型侧的拒绝，不是引擎进程本身的问题。
     */
    prewarm: {
      modelUnavailable: '所需模型还没有下载，请先到模型管理里下载该模型。错误码 MDL-012',
      resourceUnavailable: '模型文件不完整或读取失败，请到模型管理里重新下载。错误码 MDL-013',
      invalidConfiguration: '当前的模型或语言设置无法用于字幕，请先到模型管理里完成模型配置。错误码 MDL-014',
      resourceBusy: '模型正在卸载或切换，请稍候再开启字幕服务。错误码 MDL-015',
      sessionAlreadyRunning: '已有一场字幕会话在运行，请先结束它再开启字幕服务。错误码 MDL-016',
    },
  },

  legal: {
    aiGeneratedRecord: '本条记录的译文由模型生成，仅供参考。',
    aiGeneratedExport: '本文件含模型生成的译文，重要场合请先核对。',
    // 这两条是产品级的常驻声明，工作台与记录详情共用，不要去借 workspace.* 的 key。
    statusAutosave: '记录自动保存',
    statusDataSafe: '数据保存在本机',
    license: '以 GPL-3.0 协议开源',
  },

  // 只在开发构建里出现的页签（见 routes.tsx 的 SETTINGS_TABS）。
  dev: {
    tabLabel: '开发者选项',
    intro: '这个页签只出现在开发构建里，用来手动触发界面元素，检查配色、排版和动效。',
    run: '触发',

    sectionToast: '通知',
    sectionDialog: '弹窗',
    sectionAppDialogs: '应用真实弹窗',
    sectionStatus: '状态与反馈',
    sectionToken: '设计 Token',
    sectionMotion: '动效',

    toastDefault: '普通通知', toastDefaultDesc: '默认样式，几秒后自动消失。',
    toastAccent: '强调通知', toastAccentDesc: '强调色，适合要被人看见但不紧急的消息。',
    toastSuccess: '成功通知', toastSuccessDesc: '操作已经完成。',
    toastWarning: '警告通知', toastWarningDesc: '事情办成了，但有一处值得留意。',
    toastDanger: '错误通知', toastDangerDesc: '操作没能完成，需要处理。',
    toastSticky: '常驻通知', toastStickyDesc: '不会自动消失，要手动关掉。',
    toastLoading: '加载通知', toastLoadingDesc: '带进度动画，结束后换成完成状态。',
    toastAction: '带按钮的通知', toastActionDesc: '通知里放一个操作按钮，点过之后按钮变成完成状态。',
    toastUpdate: '改写已有通知', toastUpdateDesc: '重写已经显示的那条，而不是再弹一条。',
    toastFlood: '连续多条通知', toastFloodDesc: '一次弹六条，看堆叠时的排布。',
    toastClear: '清空通知', toastClearDesc: '一次关掉屏幕上剩下的全部通知。',
    toastSampleTitle: '字幕已保存',
    toastSampleBody: '这一场同传的字幕已经写进本地记录。',
    toastActionLabel: '撤销',
    toastActionDone: '已撤销',
    toastLoadingDone: '已完成',

    dialogConfirm: '确认弹窗', dialogConfirmDesc: '常规二次确认，取消和确定一样显眼。',
    dialogDestructive: '危险弹窗', dialogDestructiveDesc: '把破坏性后果说在前面，确定按钮用危险色。',
    dialogPending: '处理中弹窗', dialogPendingDesc: '确定后按钮转为加载态，做完再恢复可点。',
    dialogModal: '遮罩弹窗', dialogModalDesc: '背后内容变暗，点遮罩可以关闭。',
    dialogConfirmTitle: '结束这场同传？',
    dialogConfirmBody: '字幕会先保存再停止，已经识别出的内容不会丢。',
    dialogDestructiveTitle: '删掉这条记录？',
    dialogDestructiveBody: '记录和里面的字幕会一起从磁盘删除，没有找回的办法。',
    dialogPendingTitle: '正在保存字幕',
    dialogPendingBody: '写完之前请别关软件，关掉会丢掉这一场。',
    dialogPendingWorking: '正在保存',
    dialogPendingDone: '保存完成',
    dialogModalTitle: '这条记录来自上一场同传',
    dialogModalBody: '译文由模型生成，重要场合请先核对再用。',
    dialogModalClose: '知道了',

    dialogSessionSetup: '新建同传弹窗', dialogSessionSetupDesc: '应用里最大的表单，六个字段加底部操作栏。',
    dialogPreflight: '开始前检查弹窗', dialogPreflightDesc: '打开时会真的检查运行组件、拉起引擎子进程并探测设备。',
    dialogRename: '重命名弹窗', dialogRenameDesc: '带输入框的确认框，确定后对不存在的记录静默失败。',
    dialogExport: '导出弹窗', dialogExportDesc: '三种导出格式可切换。打开时会清掉记录页残留的错误提示。',
    dialogModelConfig: '模型配置弹窗', dialogModelConfigDesc: '正文内部滚动，含槽位、引擎选择和语言多选。',
    dialogCompat: '翻译不兼容弹窗', dialogCompatDesc: '打开后正文是空的，要再点一次换模型或换语言才出选择框。',
    dialogNotices: '第三方声明弹窗', dialogNoticesDesc: '仓库里的开源声明全文，控件区就是它自带的按钮。',
    dialogStopSession: '结束会话弹窗', dialogStopSessionDesc: '危险色确认，正文说明字幕会先保存。',
    dialogSessionError: '会话失败弹窗', dialogSessionErrorDesc: '用假错误码打开，主按钮是重试而不是结束会话。',
    dialogBulkDelete: '批量删除弹窗', dialogBulkDeleteDesc: '选中多条记录时的删除确认，标题和按钮都带条数。',
    dialogRuntimeMissing: '缺少环境弹窗', dialogRuntimeMissingDesc: '运行组件缺失时的提示，示例里两个组件都缺，两个安装按钮都出现。按钮按下去不会跳页面，也不会改设置。',
    dialogAppUpdate: '软件更新弹窗', dialogAppUpdateDesc: '有新版本时的提示，示例里的版本是假的。按钮按下去不会打开浏览器，也不会改设置。',
    dialogModelDetail: '模型详情抽屉', dialogModelDetailDesc: '模型搜索结果点进详情时左侧滑出的面板，可选字段都填满了，正文和整列信息行一次看全。示例里的仓库是编的，链接打不开；按安装不会真的下载。',

    statusPill: '状态标签', statusPillDesc: '把一个短状态贴在内容旁边。',
    statusAlert: '内联提醒', statusAlertDesc: '带标题和说明的提示条。',
    statusEmpty: '空状态', statusEmptyDesc: '没有内容时的占位，一般会给一个去处。',
    statusSkeleton: '加载占位', statusSkeletonDesc: '内容还没到，先用灰块占住位置。',
    statusProgress: '进度条', statusProgressDesc: '不确定进度和确定进度两种形态。',
    statusEmptyTitle: '还没有同传记录',
    statusEmptyBody: '完成第一场同传之后，记录会出现在这里。',
    statusEmptyAction: '开始同传',
    statusAlertTitle: '识别模型没有安装',
    statusAlertBody: '这场只会输出原文，不会翻译。',
    statusProgressPending: '正在准备模型，第一次加载要等一会儿',
    statusProgressDone: '模型已就绪',

    tokenColor: '语义色',
    tokenRadius: '圆角档位',
    tokenSpace: '间距档位',
    tokenFont: '字阶',

    motionReduced: '减弱动效', motionReducedDesc: '系统打开「减少动态效果」时，界面只做淡入。',
    motionPreview: '动效预览', motionPreviewDesc: '把常用过渡连着播一遍，用来确认节奏。',
  },
} as const

/**
 * 放宽字面量类型，保留 key 结构。这样 `en` 填英文、中文源保留字面量，
 * 漏 key 或多 key 依然会在编译期报错。
 */
type Widen<T> = T extends string ? string : { readonly [K in keyof T]: Widen<T[K]> }

export type Dictionary = Widen<typeof zhCN>
