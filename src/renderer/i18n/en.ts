import type { Dictionary } from './zh-CN'
import { shellEn } from './shell-ui'
import { homeRecordsEn } from './home-records-ui'
import { workspaceEn } from './workspace-ui'
import { modelsSettingsEn } from './models-settings-ui'

/**
 * 英文词典。类型来自 `zh-CN.ts`，漏 key 会在这里报错。
 * 不直译中文的啰嗦：中文那句是废话的，英文删掉或压缩。
 */

export const en: Dictionary = {
  shellUi: shellEn,
  homeRecordsUi: homeRecordsEn,
  workspaceUi: workspaceEn,
  modelsSettingsUi: modelsSettingsEn,
  app: {
    name: 'Nola Translator',
  },

  nav: {
    home: 'Home',
    workspace: 'Session',
    records: 'Records',
    models: 'Models',
    settings: 'Settings',
  },

  titleBar: {
    engineReady: 'Engine ready',
    engineIdle: 'Engine not started',
    engineStarting: 'Engine starting',
    engineRecovering: 'Engine reconnecting',
    engineFailed: 'Engine failed to start',
    language: 'Interface language',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'Match system',
    themeToLight: 'Switch to light',
    themeToDark: 'Switch to dark',
    helpMenu: 'Help menu',
  },

  language: {
    zhCN: '简体中文',
    en: 'English',
  },

  home: {
    quickStart: 'Quick session',
    overlayCaptions: 'Floating captions',
    records: 'Records',
    models: 'Models',
    recentMeetings: 'Recent sessions',
    noMeetings: 'No sessions yet',
    noMeetingsAction: 'Start your first session',
  },

  session: {
    title: 'New session',
    name: 'Name',
    nameHelpAria: 'About the name',
    nameHint: 'This box shows the name the system will give this session, derived from the start time and which meeting of the day it is. Leave it as it is to use it; editing it makes it a custom name for this session.',
    audioSource: 'Audio source',
    sourceLanguage: 'Source language',
    targetLanguage: 'Target language',
    translation: 'Translation',
    translationLanguage: 'Translate into',
    translationModel: 'Translation model',
    swapLanguages: 'Swap languages',
    recognitionModel: 'Recognition model',
    keepAudio: 'Keep audio',
    keepAudioHint: 'Without audio you cannot replay or export the session. Audio is kept on this machine and stays replayable from the record afterwards.',
    cancel: 'Cancel',
    start: 'Start',
    stepPreflight: 'Check',
  },

  preflight: {
    title: 'Pre-flight check',
    checkingDevices: 'Detecting audio input',
    checkingModels: 'Verifying models',
    deviceUnavailable: 'No usable audio input found',
    // The device row when the engine never answered. Deliberately says nothing about devices:
    // the probe also boots the engine, so a device verdict here would misreport an engine
    // failure as a hardware one. `errors.engineNotReady` (ENG-001) carries the real cause.
    deviceCheckBlocked: 'Audio input check could not complete',
    modelMissing: 'Missing model: {name}',
    installNow: 'Install now',
    later: 'Later',
    allReady: 'All checks passed',
    start: 'Start session',
  },

  workspace: {
    start: 'Start session',
    starting: 'Connecting to the local engine',
    pause: 'Pause',
    resume: 'Resume',
    paused: 'Paused',
    stop: 'End session',
    stopping: 'Ending session',
    endConfirm: 'End session?',
    endConfirmTitle: 'End this session?',
    endConfirmBody: 'Captions and notes are saved on exit, and the live view cannot be reopened.',
    keepGoing: 'Keep going',
    end: 'End',
    displayMode: 'Show',
    modeBoth: 'Both',
    modeSource: 'Source only',
    modeTranslation: 'Translation only',
    layout: 'Layout',
    layoutSplit: 'Two columns',
    layoutSentence: 'One sentence per line',
    fontLarger: 'Larger captions',
    fontSmaller: 'Smaller captions',
    notes: 'Notes',
    nothingYet: 'No captions yet',
    nothingYetHint: 'Start a session and each recognised sentence lands here.',
    sourcePanel: 'Live Transcription',
    translationPanel: 'Translation',
  },

  overlay: {
    title: 'Floating captions',
    notStarted: 'Click the microphone button below to start captioning',
    // 译文轨道那一侧。中文界面下这里也保持英文：那一行的语义就是「译文」，写成中文会让人以为翻译失败。
    notStartedHint: 'Click the microphone button below to start captioning',
    micStart: 'Start mic',
    micStop: 'Stop mic',
    micLoading: 'Preparing the recognition engine',
    pin: 'Pin',
    unpin: 'Unpin',
    lock: 'Lock position and size',
    unlock: 'Unlock position and size',
    displayMode: 'Show',
    layout: 'Layout',
    position: 'Position',
    minimize: 'Minimize to taskbar',
    close: 'Close overlay',
    closeTitle: 'Close the floating caption window?',
    closeBody: 'This also stops the current session and the caption service stops listening. Saved meeting records are not affected.',
    closeConfirm: 'Close and stop',
    closing: 'Stopping…',
    closeFailed: 'Unable to close. Please retry.',
    style: 'Style',
    size: 'Font size',
  },

  records: {
    title: 'Records',
    subtitle: 'View and manage your session history',
    search: 'Search records',
    // Mirrors the zh note: `matches()` searches title + language codes only, never the
    // transcript body. See `features/records/recordLogic.ts`.
    searchPlaceholder: 'Search by name or language',
    noRecords: 'No records yet',
    noRecordsHint: 'Every finished session lands here automatically.',
    startFirst: 'Start your first session',
    noResults: 'No matching records',
    noResultsHint: 'Try another keyword, or clear the search.',
    clearSearch: 'Clear search',
    columnName: 'Name',
    columnDuration: 'Duration',
    columnActions: 'Actions',
    view: 'Open',
    rename: 'Rename',
    delete: 'Delete',
    total: '{count} total',
    goToPage: 'Go to page {page}',
    detailSource: 'Source',
    detailTranslation: 'Translation',
    export: 'Export',
    exportTitle: 'Export record',
    exportConfirm: 'Export',
    renameTitle: 'Rename',
    renameLabel: 'New name',
    renameRequired: 'Name cannot be empty',
    deleteTitle: 'Delete this record?',
    deleteBody: 'Captions, translation and audio are removed for good.',
    audioUnavailable: 'Audio was not kept for this session',
    playerPlay: 'Play',
    playerPause: 'Pause',
  },

  notes: {
    title: 'Notes',
    placeholder: 'Ctrl+B bold, Ctrl+I italic',
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    strikethrough: 'Strikethrough',
  },

  models: {
    title: 'Models',
    tabRecommended: 'Recommended',
    tabInstalled: 'Installed',
    tabSearch: 'Search',
    tabDownloads: 'Downloads',
    asrModels: 'Speech recognition',
    mtModels: 'Translation',
    install: 'Install',
    cancel: 'Cancel download',
    installed: 'Installed',
    remove: 'Uninstall',
    setDefault: 'Set as default',
    notInstalled: 'Not installed',
    downloadFailed: 'Download failed',
    retry: 'Retry',
    verifying: 'Verifying',
    searchPlaceholder: 'Search model name or source',
    filterAll: 'All',
    filterAsr: 'Recognition',
    filterMt: 'Translation',
    filterQuant: 'Quantisation',
    details: 'Model details',
    openDetails: 'View details',
    noDescription: 'No model description available',
    noResults: 'No matching models',
    loadMore: 'Load more',
    loadMoreFailed: 'Unable to load more models. Please retry.',
    noMoreResults: 'All results loaded',
    viewOnHub: 'Read the full model card on Hugging Face',
    installFailed: 'Unable to install this model. See diagnostics for details.',
    downloadsEmpty: 'No downloads in progress',
    downloadsEmptyHint: 'Pick a model from Recommended or Search to install it.',
    progress: '{percent}%',
    queued: 'Queued',
    stateLabel: 'State',
    size: 'Size',
    quantization: 'Quantisation',
    // The engine inspects a bounded number of hits, so say outright that this is not everything.
    // The list is NOT filtered on `compatible` — un-installable repos stay on screen, so
    // "{installable} of those can be installed" is exactly what explains that screen of disabled
    // buttons. It counts the inspected entries, independent of the quantisation filter.
    searchTruncated: 'The hub listed {candidates} candidates. {inspected} were checked, {installable} of those can be installed by this app. The rest were not judged.',
    searchRateLimited: 'Hugging Face rate limited the search, so it stopped early and the results may be incomplete.',
    // An empty box is "browse", not "no search". The whole popular list is shown, including what
    // this app cannot install: Hugging Face's top ASR (whisper/t5/wav2vec2) and translation
    // (opus-mt) models are all encoder-decoder, which this engine's decoder-only loaders cannot
    // load. So each card states its own verdict rather than hiding the un-installable ones —
    // hiding them leaves the browse mode permanently empty.
    browsingHint: 'The search box is empty, so these are the most downloaded models on Hugging Face, not search results. Each card says whether this app can install it.',
    browsingLoading: 'Fetching popular models and checking each one for installability. This reads a dozen repositories over the network and usually takes several seconds.',
    author: 'Publisher',
    taskType: 'Task type',
    architecture: 'GGUF architecture',
    loader: 'Loader',
    fileCount: 'Files',
    verdictCode: 'Verdict code',
    evidence: 'Evidence',
    recheck: 'Check again',
    recheckFailed: 'No fresh verdict came back. The one on screen still stands.',
    reasonCode: {
      adapterMatched: 'Matched a registered adapter',
      llamaCppTranslationModel: 'llama.cpp can load it',
      noRegisteredAdapter: 'No adapter matched',
      unsupportedArchitecture: 'The engine cannot run this architecture',
      llamaCppUnsupportedArchitecture: 'llama.cpp does not support this GGUF architecture',
      ggufArchitectureUnknown: 'The repo does not declare a GGUF architecture',
      slotUnsupportedForLoader: 'The loader does not fit this kind of model',
      ggufFileMissing: 'The repo has no GGUF weights',
      hubNoPublishedDigest: 'The weights have no verifiable digest',
      whisperCppFormat: 'whisper.cpp specific format',
      hubGated: 'Gated repo, not authorised',
      hubPrivate: 'Private repo, not authorised',
      repositoryInstallsDependencies: 'The repo installs its own dependencies',
      missingRequiredFiles: 'Files the loader needs are missing',
      missingWeights: 'Configuration only, no weights',
    },
  },

  settings: {
    title: 'Settings',
    groupAppearance: 'Appearance',
    groupLanguage: 'Language',
    theme: 'Theme',
    reduceMotion: 'Reduce motion',
    uiLanguage: 'Interface language',
    groupInput: 'Input',
    groupRecognition: 'Recognition',
    groupRecording: 'Recording',
    audioSource: 'Audio source',
    testAudio: 'Test audio',
    sourceLanguage: 'Source language',
    recognitionModel: 'Recognition model',
    keepAudio: 'Keep audio',
    keepAudioHint: 'Without audio you cannot replay or export the session.',
    groupProvider: 'Translation provider',
    groupConnection: 'Connection',
    provider: 'Provider',
    translateIntermediate: 'Pivot language',
    endpoint: 'Endpoint',
    region: 'Region',
    model: 'Model',
    apiKey: 'API key',
    apiKeyPlaceholder: 'sk-...',
    saveKey: 'Save key',
    deleteKey: 'Delete key',
    testing: 'Testing connection',
    /*
     * "Local model" / "Cloud model" are UI concepts, not product names: Hy-MT2 and M2M100
     * collapse into the former (the selected model id decides which one actually runs), and
     * OpenAI and Ollama into the latter (Ollama is an API format from here on, not a provider).
     * Only "Microsoft Translator" is a product name and stays put.
     */
    providerLocal: 'Local model',
    providerCloud: 'Cloud model',
    providerMicrosoft: 'Microsoft Translator',
    groupLocalModel: 'Local model in use',
    localModelEmpty: 'No local translation model is installed yet. Download one in Models first.',
    /*
     * The seven cloud fields. The API format decides how deep the endpoint has to go (Anthropic
     * takes a bare origin, the rest stop at /v1), so each format carries its own hint — getting
     * that depth wrong is the mistake you cannot read back out of an error message.
     */
    apiFormat: 'API format',
    apiFormatChatCompletions: 'Chat Completions (/v1/chat/completions)',
    apiFormatChatResponses: 'Chat Responses (/v1/responses)',
    apiFormatAnthropic: 'Anthropic Messages (/v1/messages)',
    apiFormatOllama: 'Ollama (/api/chat)',
    endpointHintChatCompletions: 'Up to and including /v1, e.g. https://api.example.com/v1',
    endpointHintChatResponses: 'Up to and including /v1; requests go to /v1/responses',
    endpointHintAnthropic: 'Site origin only: no /v1 or /v1/messages, e.g. https://api.anthropic.com',
    endpointHintOllama: 'Local Ollama address, e.g. http://127.0.0.1:11434',
    apiName: 'Name',
    apiNamePlaceholder: 'e.g. Zhipu GLM',
    endpointPlaceholder: 'https://api.example.com/v1',
    // The row reads "Model ID", not "Model": this field takes the vendor's model identifier
    // (gpt-4.1-mini). Typing the vendor name here is the most common useless answer, so the
    // label says which of the two this is before the user types.
    modelId: 'Model ID',
    contextWindow: 'Context window',
    maxOutputTokens: 'Max output tokens',
    // 分组名已经是 "Layout"，行标签再说一次 "Layout" 就在同一屏里出现两个一样的词。
    // 行标签要说清它管的是哪一段排版：原文与译文怎么分区。
    captionLayout: 'Caption layout',
    overlayPosition: 'Overlay position',
    positionFree: 'Free placement',
    positionTop: 'Top of screen',
    positionBottom: 'Bottom of screen',
    overlayScheme: 'Overlay theme',
    schemeDark: 'Dark',
    schemeLight: 'Light',
    fontFamily: 'Font family',
    sourceFontSize: 'Source font size',
    translationFontSize: 'Translation font size',
    lineHeight: 'Line height',
    backgroundOpacity: 'Background opacity',
    backgroundColor: 'Background color',
    sourceColor: 'Source color',
    translationColor: 'Translation color',
    showSource: 'Show source',
    showTranslation: 'Show translation',
    groupStorage: 'Storage',
    groupRestart: 'Restart',
    storagePath: 'Save location',
    browse: 'Browse',
    restartRequired: 'Takes effect after a restart',
    restartNow: 'Restart now',
    groupEngine: 'Engine',
    groupReport: 'Report a problem',
    engineStatus: 'Engine status',
    engineVersion: 'Engine version',
    enginePath: 'Install path',
    protocolVersion: 'Protocol',
    copyDiagnostics: 'Copy diagnostics',
    copied: 'Copied',
    groupDiagnostics: 'Diagnostics',
    diagnosticsLoading: 'Loading…',
    diagnosticsFailed: 'Could not read diagnostics',
    diagnosticsUnavailable: 'Diagnostics are unavailable',
    diagnosticsEmpty: 'Diagnostics are empty',
    resetAll: 'Reset all settings',
    resetAllTitle: 'Reset all settings?',
    resetAllBody: 'Preferences are cleared. Models and records stay.',
  },

  common: {
    cancel: 'Cancel',
    confirm: 'Confirm',
    close: 'Close',
    copied: 'Copied',
    loading: 'Loading',
    saved: 'Saved',
    done: 'Done',
  },

  status: {
    running: 'Running',
    error: 'Error',
    downloading: 'Downloading',
    ok: 'OK',
  },

  errors: {
    /*
     * 每条错误**只写一句完整的话**（发生了什么 + 错误码）。不要再补第二行"你该做什么"：
     * 第二行原本直接复用了按钮那一条，于是对话框里"Retry start"会连着出现两遍。
     * 按钮自己就是出路，正文再加一遍只是重复。
     */
    engineNotReady: 'The local engine is not running, so recognition cannot start. Code ENG-001',
    // 预检状态不是失败：用户还没动手，所以不给错误码，也不用"yet"以外的 scary 语气。
    // **当前没有界面在用这一条**：冷启动不再报"引擎没运行"，引擎起不来走的是上面
    // `engineNotReady`（带 ENG-001）。留着是为了不删掉 `i18n.test.ts` 的 `noCodeByDesign`
    // 里点名的那一条；**别拿它把冷启动那条 Alert 加回来** —— 那正是它当初的错误用法。
    engineNotReadyPreflight: 'The local engine is not running, so recognition cannot start yet.',
    // 会话中途引擎掉了。不能说"无法开始"——这场已经在跑了，说的是"停了"。
    engineStopped: 'The local engine stopped, so recognition has stopped.',
    // 进程没了：重连出来的是新进程，这场会回不来，出路是那条记录而不是"重试"。
    engineLost: 'The local engine stopped during the session, which ended early. Captions captured so far are saved. Code ENG-002',
    engineLostAction: 'Open the record',
    engineNotReadyAction: 'Retry start',
    deviceNotFound: 'No usable audio input device was found. Code AUD-002',
    deviceNotFoundAction: 'Check the system sound settings',
    modelMissing: 'The recognition model is not installed yet. Code MDL-003',
    modelMissingAction: 'Install the model',
    startFailed: 'The session could not start. Check the selected model, compute device and runtime. Code SES-004',
    startFailedAction: 'Start the session again',
    downloadFailed: 'The model download stopped, partial files were kept. Code NET-006',
    downloadFailedAction: 'Retry the download',
    searchFailed: 'Model search is unavailable. What follows is not a search result; Hugging Face may well have this model. Code NET-006',
    searchFailedAction: 'Retry the search',
    translateFailed: 'The translation service did not respond, showing source only. Code MT-007',
    translateFailedAction: 'Check the API key and your network',
    storageChanged: 'The save location is no longer valid, captions cannot reach disk. Code STO-008',
    storageChangedAction: 'Pick a new save location',
    exportFailed: 'Export failed, no file was written. Code EXP-009',
    // The preload never ran, so this window has no engine behind it. UIP rather than ENG:
    // the engine is fine, the wiring is not.
    engineNotConnected: 'The local engine is not connected, so settings, records, and models cannot be read. Code UIP-011',
    pageCrashed: 'The interface stopped rendering, the session is still running. Code UIP-010',
    pageCrashedAction: 'Reload the window',
    copyDiagnosticsAction: 'Copy diagnostics',
  },

  legal: {
    aiGeneratedRecord: 'The translation in this record is machine generated.',
    aiGeneratedExport: 'This file contains machine generated translation. Proofread before reuse.',
    // Product-level standing disclosures, shared by the workbench and the record detail.
    // Do not borrow workspace.* keys for these.
    statusAutosave: 'Saved automatically',
    statusDataSafe: 'Data stays on this device',
    license: 'Open source under GPL-3.0',
  },
}
