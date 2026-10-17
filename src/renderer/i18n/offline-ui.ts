export interface OfflineCopy {
  stepsComplete: string
  modelPath: string
  pathPlaceholder: string
  inspectPath: string
  repositoryHelp: string
  importTab: string
  manualDownload: string
  supportedModels: string
  supportedHint: string
  recognitionFamilies: string
  translationFamilies: string
  importInfo: string
  fileType: string
  folderType: string
  modelChoice: string
  downloadSource: string
  savePath: string
  choosePath: string
  pathAfterChoose: string
  downloadModel: string
  requiredFiles: string
  downloadInfo: string
  downloadHelp: string
  repository: string
  versionInfo: string
  estimatedHelp: string
  runtimeOnly: string
  estimatedSize: string
  requiredSpace: string
  availableSpace: string
  missingRuntime: string

  title: string
  modelImport: string
  prepare: string
  bundleImport: string
  description: string
  selectFile: string
  selectFolder: string
  selectBundle: string
  ready: string
  installed: string
  invalid: string
  install: string
  close: string
  back: string
  next: string
  start: string
  resources: string
  target: string
  confirm: string
  includeRuntime: string
  current: string
  other: string
  hardware: string
  advanced: string
  recognition: string
  translation: string
  none: string
  cpu: string
  cuda: string
  xpu: string
  directml: string
  vulkan: string
  output: string
  task: string
  completed: string
  failed: string
  cancelled: string
  background: string
  cancel: string
  retry: string
  unavailable: string
  missingFiles: string
  checksumMismatch: string
  unsupportedModel: string
  incompatible: string
  insufficientSpace: string
  invalidPackage: string
  busy: string
  check: string
  download: string
  copy: string
  verify: string
  pack: string
  modelHelp: string
  targetHelp: string
  runtimeHelp: string
  readyHelp: string
}
export const offlineZh: OfflineCopy = {
  stepsComplete: '{done} / {total} 步已完成',
  modelPath: '模型路径', pathPlaceholder: '输入或选择文件夹路径', inspectPath: '检查模型',
  repositoryHelp: '可选填 Hugging Face 仓库 ID（owner/model）以获取介绍。留空时尝试读取本地元数据；无法联网仍可检查与导入。',
  importTab: '导入模型',
  manualDownload: '手动下载',
  supportedModels: '支持的模型',

  supportedHint: '按架构、格式与必需文件检查兼容性，不限制推荐版本。自定义模型导入后请配置用途、引擎与语言能力。',
  recognitionFamilies: 'Qwen3-ASR · SenseVoiceSmall',
  translationFamilies: 'Hy-MT2 · Index-Translate · M2M100',
  importInfo: '导入说明',
  fileType: 'GGUF 权重',
  folderType: '完整权重与配套文件',
  modelChoice: '模型',
  downloadSource: '下载来源',
  requiredFiles: '所需文件',
  downloadInfo: '下载说明',
  downloadHelp: '自动下载所选模型的全部必需文件，完成校验后保存到所选文件夹，可直接导入。',
  savePath: '保存位置', choosePath: '选择文件夹', pathAfterChoose: '模型将保存为一个可导入的文件夹', downloadModel: '下载模型',
  repository: '模型仓库',
  versionInfo: '固定版本',
  "title": "离线使用",
  "modelImport": "本地导入",
  "prepare": "准备离线包",
  "bundleImport": "导入离线包",
  "description": "为无法联网的电脑准备模型和完整运行组件。",
  "selectFile": "选择模型文件",
  "selectFolder": "选择模型文件夹",
  "selectBundle": "选择离线包",
  "ready": "可安装",
  "installed": "已存在，跳过",
  "invalid": "无法安装",
  "install": "开始安装",
  "close": "关闭",
  "back": "上一步",
  "next": "下一步",
  "start": "开始准备",
  "resources": "选择资源",
  "target": "目标电脑",
  "confirm": "确认内容",
  "includeRuntime": "包含所需运行组件及全部依赖",
  "current": "当前电脑",
  "other": "另一台 Windows 电脑",
  "hardware": "运算设备",
  "advanced": "高级组件选择",
  "recognition": "识别模型",
  "translation": "翻译模型",
  "none": "不包含",
  "cpu": "CPU",
  "cuda": "NVIDIA / CUDA",
  "xpu": "Intel / XPU",
  "directml": "DirectML",
  "vulkan": "Vulkan",
  "output": "打开所在文件夹",
  "task": "离线任务",
  "completed": "已完成",
  "failed": "操作失败，请重试。",
  "cancelled": "已取消",
  "background": "后台继续",
  "cancel": "取消任务",
  "retry": "重新选择",
  "unavailable": "此演示不提供本地文件操作。",
  "missingFiles": "缺少必要文件，请补齐后重新选择。",
  "checksumMismatch": "文件校验失败，请重新复制。",
  "unsupportedModel": "未识别到受支持的模型。",
  "incompatible": "此资源与当前应用或电脑不兼容。",
  "insufficientSpace": "磁盘空间不足。",
  "invalidPackage": "离线包无效或不完整。",
  "busy": "其他任务正在占用运行组件，请稍后重试。",
  "check": "检查",
  "download": "下载",
  "copy": "复制",
  "verify": "校验",
  "pack": "打包",

  modelHelp: '按架构、格式与必需文件检查兼容性，不限制推荐版本。自定义模型导入后请配置用途、引擎与语言能力。 ASR GGUF 还需要配套的 mmproj 音频编码器；请与主权重放在同一文件夹。',
  "targetHelp": "按目标电脑选择。准备电脑不需要安装这些组件。",
  "runtimeHelp": "GPU 驱动须在目标电脑上安装。CPU 方案兼容性较好，速度可能较慢。",
  "readyHelp": "安装材料均从包内读取，不连接网络。",
  "runtimeOnly": "仅准备运行组件时，可将两个模型都设为“不包含”。",
  "estimatedSize": "已知文件大小下限",
  "requiredSpace": "安装所需空间",
  "availableSpace": "可用空间",
  "missingRuntime": "模型可导入，但仍需安装相应运行组件。",
  "estimatedHelp": "包含模型和已固定的组件文件；额外依赖大小将在准备时确定。"
}
export const offlineEn: OfflineCopy = {
  stepsComplete: '{done} of {total} steps complete',
  modelPath: 'Model path', pathPlaceholder: 'Enter or choose a folder path', inspectPath: 'Check model',
  repositoryHelp: 'Optionally enter a Hugging Face repository ID (owner/model) to fetch its description. Otherwise local metadata is used when available. Compatibility checks and import also work offline.',
  importTab: 'Import model',
  manualDownload: 'Manual download',
  supportedModels: 'Supported models',

  supportedHint: 'Compatibility is checked from architecture, format and required files, without a recommended-version restriction. Configure custom model tasks, engines and languages after import.',
  recognitionFamilies: 'Qwen3-ASR · SenseVoiceSmall',
  translationFamilies: 'Hy-MT2 · Index-Translate · M2M100',
  importInfo: 'Import details',
  fileType: 'GGUF weights',
  folderType: 'Complete weights and companion files',
  modelChoice: 'Model',
  downloadSource: 'Download source',
  requiredFiles: 'Required files',
  downloadInfo: 'Download details',
  downloadHelp: 'Downloads all required model files, verifies them, and saves an importable folder at the selected location.',
  savePath: 'Save location', choosePath: 'Choose folder', pathAfterChoose: 'The model will be saved as an importable folder', downloadModel: 'Download model',
  repository: 'Repository',
  versionInfo: 'Pinned revision',
  "title": "Offline use",
  "modelImport": "Import local model",
  "prepare": "Prepare offline package",
  "bundleImport": "Import offline package",
  "description": "Prepare models and complete runtime components for a computer without internet access.",
  "selectFile": "Choose model file",
  "selectFolder": "Choose model folder",
  "selectBundle": "Choose offline package",
  "ready": "Ready to install",
  "installed": "Already installed, skip",
  "invalid": "Cannot install",
  "install": "Install",
  "close": "Close",
  "back": "Back",
  "next": "Next",
  "start": "Prepare package",
  "resources": "Choose resources",
  "target": "Target computer",
  "confirm": "Review contents",
  "includeRuntime": "Include required runtime components and all dependencies",
  "current": "This computer",
  "other": "Another Windows computer",
  "hardware": "Compute device",
  "advanced": "Advanced component selection",
  "recognition": "Recognition model",
  "translation": "Translation model",
  "none": "Do not include",
  "cpu": "CPU",
  "cuda": "NVIDIA / CUDA",
  "xpu": "Intel / XPU",
  "directml": "DirectML",
  "vulkan": "Vulkan",
  "output": "Open containing folder",
  "task": "Offline task",
  "completed": "Completed",
  "failed": "Operation failed. Please retry.",
  "cancelled": "Cancelled",
  "background": "Continue in background",
  "cancel": "Cancel task",
  "retry": "Choose again",
  "unavailable": "Local file operations are unavailable in this demo.",
  "missingFiles": "Required files are missing. Add them and choose again.",
  "checksumMismatch": "File verification failed. Copy the files again.",
  "unsupportedModel": "No supported model was recognized.",
  "incompatible": "This resource is incompatible with the app or computer.",
  "insufficientSpace": "Not enough disk space.",
  "invalidPackage": "The offline package is invalid or incomplete.",
  "busy": "Another task is using runtime components. Try again later.",
  "check": "Checking",
  "download": "Downloading",
  "copy": "Copying",
  "verify": "Verifying",
  "pack": "Packaging",

  modelHelp: 'Compatibility is checked from architecture, format and required files, without a recommended-version restriction. Configure custom model tasks, engines and languages after import. ASR GGUF also requires its matching mmproj audio encoder in the same folder.',
  "targetHelp": "Choose for the target computer. Components do not need to be installed on this computer.",
  "runtimeHelp": "Install GPU drivers on the target computer. CPU offers broader compatibility with slower inference.",
  "readyHelp": "Installs only from package contents without internet access.",
  "runtimeOnly": "To prepare runtime components only, set both models to “Do not include”.",
  "estimatedSize": "Minimum known file size",
  "requiredSpace": "Space required",
  "availableSpace": "Available space",
  "missingRuntime": "The model can be imported, but its runtime component still needs to be installed.",
  "estimatedHelp": "Includes models and pinned component files. Additional dependency sizes are determined during preparation."
}
export const offlineTw: OfflineCopy = {
  stepsComplete: '已完成 {done} / {total} 步',
  modelPath: '模型路徑', pathPlaceholder: '輸入或選擇資料夾路徑', inspectPath: '檢查模型',
  repositoryHelp: '可選填 Hugging Face 儲存庫 ID（owner/model）取得介紹。留白時讀取本機中繼資料；離線仍可檢查與匯入。',
  importTab: '匯入模型',
  manualDownload: '手動下載',
  supportedModels: '支援的模型',

  supportedHint: '依架構、格式與必要檔案檢查相容性，不限推薦版本。匯入後請設定自訂模型的用途、引擎與語言。',
  recognitionFamilies: 'Qwen3-ASR · SenseVoiceSmall',
  translationFamilies: 'Hy-MT2 · Index-Translate · M2M100',
  importInfo: '匯入說明',
  fileType: 'GGUF 權重',
  folderType: '完整權重與配套檔案',
  modelChoice: '模型',
  downloadSource: '下載來源',
  requiredFiles: '必要檔案',
  downloadInfo: '下載說明',
  downloadHelp: '逐一下載清單中的全部檔案，保留原檔名與子目錄，放入同一資料夾後匯入。連結已固定至支援版本，不需下載儲存庫中的其他量化或權重。',
  savePath: '儲存位置', choosePath: '選擇資料夾', pathAfterChoose: '模型會儲存為可匯入的資料夾', downloadModel: '下載模型',
  repository: '模型儲存庫',
  versionInfo: '固定版本',
  "title": "離線使用",
  "modelImport": "本機匯入",
  "prepare": "準備離線套件",
  "bundleImport": "匯入離線套件",
  "description": "為無法連網的電腦準備模型及完整執行元件。",
  "selectFile": "選擇模型檔案",
  "selectFolder": "選擇模型資料夾",
  "selectBundle": "選擇離線套件",
  "ready": "可以安裝",
  "installed": "已存在，略過",
  "invalid": "無法安裝",
  "install": "開始安裝",
  "close": "關閉",
  "back": "上一步",
  "next": "下一步",
  "start": "開始準備",
  "resources": "選擇資源",
  "target": "目標電腦",
  "confirm": "確認內容",
  "includeRuntime": "包含所需執行元件與全部相依套件",
  "current": "目前電腦",
  "other": "另一台 Windows 電腦",
  "hardware": "運算裝置",
  "advanced": "進階元件選擇",
  "recognition": "辨識模型",
  "translation": "翻譯模型",
  "none": "不包含",
  "cpu": "CPU",
  "cuda": "NVIDIA / CUDA",
  "xpu": "Intel / XPU",
  "directml": "DirectML",
  "vulkan": "Vulkan",
  "output": "開啟所在資料夾",
  "task": "離線工作",
  "completed": "已完成",
  "failed": "操作失敗，請重試。",
  "cancelled": "已取消",
  "background": "在背景繼續",
  "cancel": "取消工作",
  "retry": "重新選擇",
  "unavailable": "此示範不提供本機檔案操作。",
  "missingFiles": "缺少必要檔案，請補齊後重新選擇。",
  "checksumMismatch": "檔案驗證失敗，請重新複製。",
  "unsupportedModel": "未辨識到支援的模型。",
  "incompatible": "此資源與目前應用程式或電腦不相容。",
  "insufficientSpace": "磁碟空間不足。",
  "invalidPackage": "離線套件無效或不完整。",
  "busy": "其他工作正在使用執行元件，請稍後重試。",
  "check": "檢查",
  "download": "下載",
  "copy": "複製",
  "verify": "驗證",
  "pack": "封裝",

  modelHelp: '依架構、格式與必要檔案檢查相容性，不限推薦版本。匯入後請設定自訂模型的用途、引擎與語言。 ASR GGUF 另需配套的 mmproj 音訊編碼器，請與主權重放在同一資料夾。',
  "targetHelp": "依目標電腦選擇。準備電腦不需要安裝這些元件。",
  "runtimeHelp": "GPU 驅動程式須在目標電腦安裝。CPU 相容性較佳，速度可能較慢。",
  "readyHelp": "僅使用套件內的安裝資源，不連接網路。",
  "runtimeOnly": "僅準備執行元件時，可將兩個模型都設為「不包含」。",
  "estimatedSize": "已知檔案大小下限",
  "requiredSpace": "安裝所需空間",
  "availableSpace": "可用空間",
  "missingRuntime": "模型可以匯入，但仍需安裝對應的執行元件。",
  "estimatedHelp": "包含模型與已固定的元件檔案；額外相依套件大小將在準備時確定。"
}
export const offlineHk: OfflineCopy = {
  stepsComplete: '已完成 {done} / {total} 步',
  modelPath: '模型路徑', pathPlaceholder: '輸入或選擇資料夾路徑', inspectPath: '檢查模型',
  repositoryHelp: '可填 Hugging Face 倉庫 ID（owner/model）取得介紹。留空時讀取本機資料；離線仍可檢查及匯入。',
  importTab: '匯入模型',
  manualDownload: '手動下載',
  supportedModels: '支援的模型',

  supportedHint: '按架構、格式及必要檔案檢查兼容性，不限推薦版本。匯入後請設定自訂模型的用途、引擎及語言。',
  recognitionFamilies: 'Qwen3-ASR · SenseVoiceSmall',
  translationFamilies: 'Hy-MT2 · Index-Translate · M2M100',
  importInfo: '匯入說明',
  fileType: 'GGUF 權重',
  folderType: '完整權重及配套檔案',
  modelChoice: '模型',
  downloadSource: '下載來源',
  requiredFiles: '所需檔案',
  downloadInfo: '下載說明',
  downloadHelp: '逐一下載清單中的全部檔案，保留原檔名及子目錄，放入同一資料夾後匯入。連結已固定至支援版本，毋須下載儲存庫內其他量化或權重。',
  savePath: '儲存位置', choosePath: '選擇資料夾', pathAfterChoose: '模型會儲存為可匯入的資料夾', downloadModel: '下載模型',
  repository: '模型儲存庫',
  versionInfo: '固定版本',
  "title": "離線使用",
  "modelImport": "本機匯入",
  "prepare": "準備離線套件",
  "bundleImport": "匯入離線套件",
  "description": "為無法上網的電腦準備模型及完整執行元件。",
  "selectFile": "選擇模型檔案",
  "selectFolder": "選擇模型資料夾",
  "selectBundle": "選擇離線套件",
  "ready": "可以安裝",
  "installed": "已存在，略過",
  "invalid": "無法安裝",
  "install": "開始安裝",
  "close": "關閉",
  "back": "上一步",
  "next": "下一步",
  "start": "開始準備",
  "resources": "選擇資源",
  "target": "目標電腦",
  "confirm": "確認內容",
  "includeRuntime": "包含所需執行元件與全部依賴套件",
  "current": "目前電腦",
  "other": "另一部 Windows 電腦",
  "hardware": "運算裝置",
  "advanced": "進階元件選擇",
  "recognition": "辨識模型",
  "translation": "翻譯模型",
  "none": "不包含",
  "cpu": "CPU",
  "cuda": "NVIDIA / CUDA",
  "xpu": "Intel / XPU",
  "directml": "DirectML",
  "vulkan": "Vulkan",
  "output": "開啟所在資料夾",
  "task": "離線工作",
  "completed": "已完成",
  "failed": "操作失敗，請重試。",
  "cancelled": "已取消",
  "background": "在背景繼續",
  "cancel": "取消工作",
  "retry": "重新選擇",
  "unavailable": "此示範不提供本機檔案操作。",
  "missingFiles": "缺少必要檔案，請補齊後重新選擇。",
  "checksumMismatch": "檔案驗證失敗，請重新複製。",
  "unsupportedModel": "未辨識到支援的模型。",
  "incompatible": "此資源與目前應用程式或電腦不相容。",
  "insufficientSpace": "磁碟空間不足。",
  "invalidPackage": "離線套件無效或不完整。",
  "busy": "其他工作正在使用執行元件，請稍後重試。",
  "check": "檢查",
  "download": "下載",
  "copy": "複製",
  "verify": "驗證",
  "pack": "封裝",

  modelHelp: '按架構、格式及必要檔案檢查兼容性，不限推薦版本。匯入後請設定自訂模型的用途、引擎及語言。 ASR GGUF 另需配套的 mmproj 音訊編碼器，請與主權重放在同一資料夾。',
  "targetHelp": "按目標電腦選擇。準備電腦不需要安裝這些元件。",
  "runtimeHelp": "GPU 驅動程式須在目標電腦安裝。CPU 相容性較好，速度可能較慢。",
  "readyHelp": "僅使用套件內的安裝資源，不連接網絡。",
  "runtimeOnly": "只準備執行元件時，可將兩個模型都設為「不包含」。",
  "estimatedSize": "已知檔案大小下限",
  "requiredSpace": "安裝所需空間",
  "availableSpace": "可用空間",
  "missingRuntime": "模型可以匯入，但仍需安裝對應的執行元件。",
  "estimatedHelp": "包含模型與已固定的元件檔案；額外依賴套件大小將在準備時確定。"
}
export const offlineJa: OfflineCopy = {
  stepsComplete: '{total} ステップ中 {done} 完了',
  modelPath: 'モデルの場所', pathPlaceholder: 'フォルダーのパスを入力または選択', inspectPath: 'モデルを確認',
  repositoryHelp: 'Hugging Face リポジトリ ID（owner/model）を任意で入力して紹介を取得できます。空欄はローカル情報を使用します。オフラインでも確認とインポートができます。',
  importTab: 'モデルをインポート',
  manualDownload: '手動ダウンロード',
  supportedModels: '対応モデル',

  supportedHint: '構造、形式と必須ファイルで互換性を確認します。推奨版以外も対象です。インポート後に用途、エンジンと言語を設定してください。',
  recognitionFamilies: 'Qwen3-ASR · SenseVoiceSmall',
  translationFamilies: 'Hy-MT2 · Index-Translate · M2M100',
  importInfo: 'インポートの説明',
  fileType: 'GGUF 重み',
  folderType: '重みと付属ファイル一式',
  modelChoice: 'モデル',
  downloadSource: 'ダウンロード元',
  requiredFiles: '必要なファイル',
  downloadInfo: 'ダウンロードの説明',
  downloadHelp: '必要なモデルファイルをすべてダウンロードして検証し、選択した場所にインポート可能なフォルダーとして保存します。',
  savePath: '保存先', choosePath: 'フォルダーを選択', pathAfterChoose: 'モデルはインポート可能なフォルダーとして保存されます', downloadModel: 'モデルをダウンロード',
  repository: 'リポジトリ',
  versionInfo: '固定リビジョン',
  "title": "オフライン利用",
  "modelImport": "ローカルモデルを追加",
  "prepare": "オフラインパッケージを作成",
  "bundleImport": "オフラインパッケージを読み込む",
  "description": "ネット接続のない PC 用にモデルと必要な実行環境を準備します。",
  "selectFile": "モデルファイルを選択",
  "selectFolder": "モデルフォルダーを選択",
  "selectBundle": "パッケージを選択",
  "ready": "インストール可能",
  "installed": "導入済み、スキップ",
  "invalid": "インストール不可",
  "install": "インストール",
  "close": "閉じる",
  "back": "戻る",
  "next": "次へ",
  "start": "作成を開始",
  "resources": "リソースを選択",
  "target": "利用する PC",
  "confirm": "内容の確認",
  "includeRuntime": "必要な実行環境とすべての依存関係を含める",
  "current": "この PC",
  "other": "別の Windows PC",
  "hardware": "演算デバイス",
  "advanced": "実行環境の詳細設定",
  "recognition": "音声認識モデル",
  "translation": "翻訳モデル",
  "none": "含めない",
  "cpu": "CPU",
  "cuda": "NVIDIA / CUDA",
  "xpu": "Intel / XPU",
  "directml": "DirectML",
  "vulkan": "Vulkan",
  "output": "保存先を開く",
  "task": "オフラインタスク",
  "completed": "完了",
  "failed": "操作に失敗しました。再試行してください。",
  "cancelled": "キャンセル済み",
  "background": "バックグラウンドで続行",
  "cancel": "タスクをキャンセル",
  "retry": "選び直す",
  "unavailable": "このデモではローカルファイルを操作できません。",
  "missingFiles": "必要なファイルがありません。追加して選び直してください。",
  "checksumMismatch": "検証に失敗しました。ファイルをコピーし直してください。",
  "unsupportedModel": "対応モデルが見つかりません。",
  "incompatible": "アプリまたは PC と互換性がありません。",
  "insufficientSpace": "ディスク容量が不足しています。",
  "invalidPackage": "パッケージが無効または不完全です。",
  "busy": "別のタスクが実行環境を使用中です。後で再試行してください。",
  "check": "確認中",
  "download": "ダウンロード中",
  "copy": "コピー中",
  "verify": "検証中",
  "pack": "作成中",

  modelHelp: '構造、形式と必須ファイルで互換性を確認します。推奨版以外も対象です。インポート後に用途、エンジンと言語を設定してください。 ASR GGUF には対応する mmproj 音声エンコーダーも必要です。同じフォルダーに置いてください。',
  "targetHelp": "利用先の PC に合わせて選択してください。この PC へのインストールは不要です。",
  "runtimeHelp": "GPU ドライバーは利用先の PC に必要です。CPU は幅広く対応しますが処理が遅くなります。",
  "readyHelp": "パッケージ内のファイルのみを使い、ネットに接続せずにインストールします。",
  "runtimeOnly": "実行環境だけ準備する場合は、両方のモデルを「含めない」にします。",
  "estimatedSize": "既知のファイルサイズの下限",
  "requiredSpace": "必要な空き容量",
  "availableSpace": "空き容量",
  "missingRuntime": "モデルは追加できますが、対応する実行環境のインストールが必要です。",
  "estimatedHelp": "モデルと固定された実行環境ファイルを含みます。追加の依存関係のサイズは準備中に確定します。"
}
export const offlineKo: OfflineCopy = {
  stepsComplete: '{total}단계 중 {done}단계 완료',
  modelPath: '모델 경로', pathPlaceholder: '폴더 경로 입력 또는 선택', inspectPath: '모델 확인',
  repositoryHelp: 'Hugging Face 저장소 ID(owner/model)를 입력해 설명을 가져올 수 있습니다. 비워 두면 로컬 메타데이터를 사용합니다. 오프라인에서도 검사하고 가져올 수 있습니다.',
  importTab: '모델 가져오기',
  manualDownload: '수동 다운로드',
  supportedModels: '지원 모델',

  supportedHint: '모델 구조, 형식 및 필수 파일로 호환성을 확인하며 권장 버전으로 제한하지 않습니다. 가져온 뒤 용도, 엔진과 언어를 설정하세요.',
  recognitionFamilies: 'Qwen3-ASR · SenseVoiceSmall',
  translationFamilies: 'Hy-MT2 · Index-Translate · M2M100',
  importInfo: '가져오기 안내',
  fileType: 'GGUF 가중치',
  folderType: '가중치 및 부속 파일 전체',
  modelChoice: '모델',
  downloadSource: '다운로드 출처',
  requiredFiles: '필요한 파일',
  downloadInfo: '다운로드 안내',
  downloadHelp: '필요한 모델 파일을 모두 다운로드하고 검증한 뒤 선택한 위치에 가져올 수 있는 폴더로 저장합니다.',
  savePath: '저장 위치', choosePath: '폴더 선택', pathAfterChoose: '모델은 가져올 수 있는 폴더로 저장됩니다', downloadModel: '모델 다운로드',
  repository: '모델 저장소',
  versionInfo: '고정 리비전',
  "title": "오프라인 사용",
  "modelImport": "로컬 모델 가져오기",
  "prepare": "오프라인 패키지 준비",
  "bundleImport": "오프라인 패키지 가져오기",
  "description": "인터넷이 없는 컴퓨터에 필요한 모델과 실행 구성 요소를 준비합니다.",
  "selectFile": "모델 파일 선택",
  "selectFolder": "모델 폴더 선택",
  "selectBundle": "패키지 선택",
  "ready": "설치 가능",
  "installed": "이미 설치됨, 건너뛰기",
  "invalid": "설치 불가",
  "install": "설치 시작",
  "close": "닫기",
  "back": "이전",
  "next": "다음",
  "start": "준비 시작",
  "resources": "리소스 선택",
  "target": "대상 컴퓨터",
  "confirm": "내용 확인",
  "includeRuntime": "필요한 실행 구성 요소와 모든 종속성 포함",
  "current": "이 컴퓨터",
  "other": "다른 Windows 컴퓨터",
  "hardware": "연산 장치",
  "advanced": "고급 구성 요소 선택",
  "recognition": "음성 인식 모델",
  "translation": "번역 모델",
  "none": "포함하지 않음",
  "cpu": "CPU",
  "cuda": "NVIDIA / CUDA",
  "xpu": "Intel / XPU",
  "directml": "DirectML",
  "vulkan": "Vulkan",
  "output": "저장 폴더 열기",
  "task": "오프라인 작업",
  "completed": "완료",
  "failed": "작업에 실패했습니다. 다시 시도하세요.",
  "cancelled": "취소됨",
  "background": "백그라운드에서 계속",
  "cancel": "작업 취소",
  "retry": "다시 선택",
  "unavailable": "이 데모는 로컬 파일 작업을 지원하지 않습니다.",
  "missingFiles": "필수 파일이 없습니다. 추가한 후 다시 선택하세요.",
  "checksumMismatch": "파일 검증에 실패했습니다. 다시 복사하세요.",
  "unsupportedModel": "지원하는 모델을 찾을 수 없습니다.",
  "incompatible": "앱 또는 컴퓨터와 호환되지 않습니다.",
  "insufficientSpace": "디스크 공간이 부족합니다.",
  "invalidPackage": "패키지가 유효하지 않거나 불완전합니다.",
  "busy": "다른 작업이 실행 구성 요소를 사용 중입니다. 나중에 다시 시도하세요.",
  "check": "확인 중",
  "download": "다운로드 중",
  "copy": "복사 중",
  "verify": "검증 중",
  "pack": "패키징 중",

  modelHelp: '모델 구조, 형식 및 필수 파일로 호환성을 확인하며 권장 버전으로 제한하지 않습니다. 가져온 뒤 용도, 엔진과 언어를 설정하세요. ASR GGUF에는 같은 폴더에 해당 mmproj 오디오 인코더도 필요합니다.',
  "targetHelp": "대상 컴퓨터에 맞게 선택하세요. 준비하는 컴퓨터에는 설치하지 않아도 됩니다.",
  "runtimeHelp": "GPU 드라이버는 대상 컴퓨터에 필요합니다. CPU는 호환성이 높지만 느릴 수 있습니다.",
  "readyHelp": "인터넷에 연결하지 않고 패키지에 포함된 파일로만 설치합니다.",
  "runtimeOnly": "실행 구성 요소만 준비하려면 두 모델 모두 “포함하지 않음”으로 설정하세요.",
  "estimatedSize": "확인된 파일 크기 하한",
  "requiredSpace": "필요한 공간",
  "availableSpace": "사용 가능한 공간",
  "missingRuntime": "모델은 가져올 수 있지만 해당 실행 구성 요소를 설치해야 합니다.",
  "estimatedHelp": "모델과 고정된 구성 요소 파일을 포함합니다. 추가 종속성의 크기는 준비 중에 결정됩니다."
}
export function offlineEntries(copy: OfflineCopy): Record<`offline.${keyof OfflineCopy}`, string> {
 return Object.fromEntries(Object.entries(copy).map(([key, value]) => [`offline.${key}`, value])) as Record<`offline.${keyof OfflineCopy}`, string>
}
