import type { DictionaryKey } from './zh-CN'

const zh = {
  navTitle: '屏幕翻译',
  title: '屏幕翻译', description: '圈选窗口或显示器中的文字，在原位置持续显示译文。',
  capture: '捕获与区域', source: '捕获对象', refresh: '刷新', select: '请选择', edit: '圈选区域', regions: '翻译区域',
  regionHint: '最多添加 8 个区域。更换捕获对象后需要重新圈选。',
  ocrTitle: 'OCR 模型', ocrDescription: 'PP-OCRv5 mobile 多语言 OCR 系列，按所需语言选择并下载模型。',
  install: '下载识别模型', delete: '删除识别模型', cancelDownload: '取消下载', installed: '已安装', missing: '未安装', downloading: '下载中', manageModels: '管理模型',
  translation: '翻译设置', sourceLanguage: '原文语言', targetLanguage: '译文语言', model: '翻译模型', auto: '自动识别',
  start: '开始翻译', pause: '暂停', resume: '恢复', stop: '停止', save: '保存设置', cancel: '取消', confirm: '确认区域',
  remove: '删除选中区域', clear: '清空区域', editorHint: '拖动添加区域，拖动区域移动，拖动右下角调整大小。确认后保持暂停。',
  shortcuts: '快捷键', toggleShortcut: '开始／暂停／恢复', editShortcut: '编辑区域', stopShortcut: '停止翻译',
  style: '覆盖显示', fontSize: '字号', opacity: '背景不透明度', showSource: '显示原文', interval: '采集间隔（毫秒）',
  original: '原文', result: '译文', previewEmpty: '启动后将在这里显示实际识别结果。',
  metrics: '处理耗时', ocrTime: '识别', translationTime: '翻译', frames: '采集帧数', saved: '设置已保存',
  states: { ready: '就绪', starting: '启动中', running: '翻译中', paused: '已暂停', waiting: '等待目标窗口', editing: '编辑区域中', error: '需要处理' },
  errors: {
    captureFailed: '无法捕获所选对象。请确认窗口仍在运行，并重新选择；独占全屏请切换为无边框或窗口模式。',
    targetUnavailable: '目标窗口不可用。请恢复窗口，或重新选择捕获对象。',
    targetChanged: '目标身份、分辨率或显示器缩放已变化。请重新选择并圈选区域。',
    ocrFailed: '文字识别失败。请检查识别模型和本地服务后重试。', ocrMissing: '请先下载完整的 PP-OCRv5 mobile 识别模型。',
    translationFailed: '部分文字翻译失败。请检查翻译模型或网络，暂停后恢复以重试。',
    shortcutConflict: '快捷键注册失败。请更换快捷键，也可使用页面或托盘控制。',
    invalidConfig: '请选择捕获对象、翻译模型和至少一个区域，并使用不同的原文与译文语言。',
    backendUnavailable: '本地识别服务不可用。请重试。',
  },
}
export type ScreenDictionary = typeof zh
const en: ScreenDictionary = {
  navTitle: 'Screen',
  title: 'Screen translation', description: 'Select text regions in a window or display and translate them in place.',
  capture: 'Capture and regions', source: 'Capture target', refresh: 'Refresh', select: 'Select', edit: 'Select regions', regions: 'Translation regions',
  regionHint: 'Add up to 8 regions. Select regions again after changing the capture target.',
  ocrTitle: 'OCR models', ocrDescription: 'PP-OCRv5 mobile multilingual OCR models. Select and download the variant for your languages.',
  install: 'Download OCR models', delete: 'Delete OCR models', cancelDownload: 'Cancel download', installed: 'Installed', missing: 'Not installed', downloading: 'Downloading', manageModels: 'Manage models',
  translation: 'Translation settings', sourceLanguage: 'Source language', targetLanguage: 'Target language', model: 'Translation model', auto: 'Detect automatically',
  start: 'Start translation', pause: 'Pause', resume: 'Resume', stop: 'Stop', save: 'Save settings', cancel: 'Cancel', confirm: 'Confirm regions',
  remove: 'Delete selected region', clear: 'Clear regions', editorHint: 'Drag to add or move a region; drag its bottom-right corner to resize. Confirmation leaves translation paused.',
  shortcuts: 'Keyboard shortcuts', toggleShortcut: 'Start / pause / resume', editShortcut: 'Edit regions', stopShortcut: 'Stop translation',
  style: 'Overlay appearance', fontSize: 'Font size', opacity: 'Background opacity', showSource: 'Show source text', interval: 'Capture interval (ms)',
  original: 'Source', result: 'Translation', previewEmpty: 'Actual recognized text appears here after translation starts.',
  metrics: 'Processing time', ocrTime: 'Recognition', translationTime: 'Translation', frames: 'Captured frames', saved: 'Settings saved',
  states: { ready: 'Ready', starting: 'Starting', running: 'Translating', paused: 'Paused', waiting: 'Waiting for target', editing: 'Editing regions', error: 'Needs attention' },
  errors: {
    captureFailed: 'Cannot capture this target. Confirm it is still running and select it again. Use windowed or borderless mode instead of exclusive fullscreen.',
    targetUnavailable: 'The target window is unavailable. Restore it or select the target again.',
    targetChanged: 'Target identity, resolution or display scale changed. Select the target and regions again.',
    ocrFailed: 'Text recognition failed. Check the OCR models and local service, then retry.', ocrMissing: 'Download the complete PP-OCRv5 mobile OCR models first.',
    translationFailed: 'Some text could not be translated. Check the translation model or network, then pause and resume to retry.',
    shortcutConflict: 'A shortcut could not be registered. Choose another shortcut or use the page or tray controls.',
    invalidConfig: 'Select a capture target, translation model and at least one region, with different source and target languages.',
    backendUnavailable: 'The local recognition service is unavailable. Retry.',
  },
}
const tw: ScreenDictionary = {
  navTitle: '螢幕翻譯',
  title: '螢幕翻譯', description: '框選視窗或顯示器中的文字，持續在原位置顯示譯文。',
  capture: '擷取與區域', source: '擷取對象', refresh: '重新整理', select: '請選擇', edit: '框選區域', regions: '翻譯區域', regionHint: '最多新增 8 個區域。更換擷取對象後需要重新框選。',
  ocrTitle: 'OCR 模型', ocrDescription: 'PP-OCRv5 mobile 多語言 OCR 系列，依所需語言選擇並下載模型。',
  install: '下載辨識模型', delete: '刪除辨識模型', cancelDownload: '取消下載', installed: '已安裝', missing: '未安裝', downloading: '下載中', manageModels: '管理模型',
  translation: '翻譯設定', sourceLanguage: '原文語言', targetLanguage: '譯文語言', model: '翻譯模型', auto: '自動辨識', start: '開始翻譯', pause: '暫停', resume: '繼續', stop: '停止', save: '儲存設定', cancel: '取消', confirm: '確認區域',
  remove: '刪除選取區域', clear: '清空區域', editorHint: '拖曳新增或移動區域，拖曳右下角調整大小。確認後保持暫停。',
  shortcuts: '快捷鍵', toggleShortcut: '開始／暫停／繼續', editShortcut: '編輯區域', stopShortcut: '停止翻譯', style: '覆蓋顯示', fontSize: '字級', opacity: '背景不透明度', showSource: '顯示原文', interval: '擷取間隔（毫秒）',
  original: '原文', result: '譯文', previewEmpty: '開始後會在這裡顯示實際辨識結果。', metrics: '處理時間', ocrTime: '辨識', translationTime: '翻譯', frames: '擷取影格數', saved: '設定已儲存',
  states: { ready: '就緒', starting: '啟動中', running: '翻譯中', paused: '已暫停', waiting: '等待目標視窗', editing: '編輯區域中', error: '需要處理' },
  errors: { captureFailed: '無法擷取所選對象。請確認視窗仍在執行並重新選擇；獨佔全螢幕請切換為無邊框或視窗模式。', targetUnavailable: '目標視窗無法使用。請還原視窗或重新選擇。', targetChanged: '目標身分、解析度或顯示器縮放已變更。請重新選擇並框選區域。', ocrFailed: '文字辨識失敗。請檢查辨識模型與本機服務後重試。', ocrMissing: '請先下載完整的 PP-OCRv5 mobile 辨識模型。', translationFailed: '部分文字翻譯失敗。請檢查翻譯模型或網路，暫停後繼續以重試。', shortcutConflict: '快捷鍵註冊失敗。請更換快捷鍵，也可使用頁面或系統匣控制。', invalidConfig: '請選擇擷取對象、翻譯模型及至少一個區域，並使用不同的原文與譯文語言。', backendUnavailable: '本機辨識服務無法使用。請重試。' },
}
const hk: ScreenDictionary = { ...tw, title: '螢幕翻譯', description: '框選視窗或顯示器中的文字，持續在原位置顯示譯文。', refresh: '重新整理', save: '儲存設定', fontSize: '字體大小', errors: { ...tw.errors, shortcutConflict: '快捷鍵註冊失敗。請更換快捷鍵，亦可使用頁面或系統匣控制。' } }
const ja: ScreenDictionary = {
  navTitle: '画面翻訳',
  title: '画面翻訳', description: 'ウィンドウや画面の文字領域を選択し、元の位置に訳文を表示します。', capture: 'キャプチャと領域', source: 'キャプチャ対象', refresh: '更新', select: '選択', edit: '領域を選択', regions: '翻訳領域', regionHint: '最大8領域。対象を変更した場合は領域を選び直してください。',
  ocrTitle: 'OCRモデル', ocrDescription: 'PP-OCRv5 mobileの多言語OCRモデルです。必要な言語に合うモデルを選んでダウンロードできます。', install: 'OCRモデルをダウンロード', delete: 'OCRモデルを削除', cancelDownload: 'ダウンロードを中止', installed: 'インストール済み', missing: '未インストール', downloading: 'ダウンロード中', manageModels: 'モデル管理',
  translation: '翻訳設定', sourceLanguage: '原文の言語', targetLanguage: '訳文の言語', model: '翻訳モデル', auto: '自動検出', start: '翻訳を開始', pause: '一時停止', resume: '再開', stop: '停止', save: '設定を保存', cancel: 'キャンセル', confirm: '領域を確定', remove: '選択領域を削除', clear: '領域をクリア', editorHint: 'ドラッグで領域を追加・移動し、右下隅でサイズ変更。確定後も一時停止を維持します。',
  shortcuts: 'ショートカット', toggleShortcut: '開始／一時停止／再開', editShortcut: '領域を編集', stopShortcut: '翻訳を停止', style: 'オーバーレイ表示', fontSize: '文字サイズ', opacity: '背景の不透明度', showSource: '原文を表示', interval: '取得間隔（ミリ秒）', original: '原文', result: '訳文', previewEmpty: '開始すると実際の認識結果を表示します。', metrics: '処理時間', ocrTime: '認識', translationTime: '翻訳', frames: '取得フレーム数', saved: '設定を保存しました',
  states: { ready: '準備完了', starting: '起動中', running: '翻訳中', paused: '一時停止中', waiting: '対象を待機中', editing: '領域を編集中', error: '確認が必要' },
  errors: { captureFailed: '対象を取得できません。起動を確認して選び直してください。排他的フルスクリーンではなくウィンドウまたはボーダーレスを使用してください。', targetUnavailable: '対象ウィンドウを利用できません。復元するか選び直してください。', targetChanged: '対象、解像度、画面の拡大率が変わりました。対象と領域を選び直してください。', ocrFailed: '文字認識に失敗しました。OCRモデルとローカルサービスを確認して再試行してください。', ocrMissing: '先にPP-OCRv5 mobileのOCRモデルをすべてダウンロードしてください。', translationFailed: '一部を翻訳できません。モデルや接続を確認し、一時停止して再開してください。', shortcutConflict: 'ショートカットを登録できません。変更するか、ページまたはトレイから操作してください。', invalidConfig: '対象、翻訳モデル、1つ以上の領域と、異なる原文・訳文言語を選択してください。', backendUnavailable: 'ローカル認識サービスを利用できません。再試行してください。' },
}
const ko: ScreenDictionary = {
  navTitle: '화면 번역',
  title: '화면 번역', description: '창이나 화면에서 텍스트 영역을 선택하고 원래 위치에 번역을 표시합니다.', capture: '캡처 및 영역', source: '캡처 대상', refresh: '새로 고침', select: '선택', edit: '영역 선택', regions: '번역 영역', regionHint: '최대 8개 영역을 추가할 수 있습니다. 캡처 대상을 바꾸면 다시 선택하세요.',
  ocrTitle: 'OCR 모델', ocrDescription: 'PP-OCRv5 mobile 다국어 OCR 모델입니다. 필요한 언어에 맞는 모델을 선택하고 다운로드하세요.', install: 'OCR 모델 다운로드', delete: 'OCR 모델 삭제', cancelDownload: '다운로드 취소', installed: '설치됨', missing: '설치되지 않음', downloading: '다운로드 중', manageModels: '모델 관리',
  translation: '번역 설정', sourceLanguage: '원문 언어', targetLanguage: '번역 언어', model: '번역 모델', auto: '자동 감지', start: '번역 시작', pause: '일시 정지', resume: '계속', stop: '중지', save: '설정 저장', cancel: '취소', confirm: '영역 확인', remove: '선택 영역 삭제', clear: '영역 비우기', editorHint: '드래그하여 영역을 추가하거나 이동하고 오른쪽 아래 모서리로 크기를 조절하세요. 확인 후에도 일시 정지를 유지합니다.',
  shortcuts: '단축키', toggleShortcut: '시작 / 일시 정지 / 계속', editShortcut: '영역 편집', stopShortcut: '번역 중지', style: '오버레이 표시', fontSize: '글자 크기', opacity: '배경 불투명도', showSource: '원문 표시', interval: '캡처 간격(ms)', original: '원문', result: '번역', previewEmpty: '시작하면 실제 인식 결과가 여기에 표시됩니다.', metrics: '처리 시간', ocrTime: '인식', translationTime: '번역', frames: '캡처 프레임', saved: '설정을 저장했습니다',
  states: { ready: '준비됨', starting: '시작 중', running: '번역 중', paused: '일시 정지됨', waiting: '대상 대기 중', editing: '영역 편집 중', error: '확인 필요' },
  errors: { captureFailed: '대상을 캡처할 수 없습니다. 실행 상태를 확인하고 다시 선택하세요. 독점 전체 화면 대신 창 또는 테두리 없는 모드를 사용하세요.', targetUnavailable: '대상 창을 사용할 수 없습니다. 창을 복원하거나 다시 선택하세요.', targetChanged: '대상, 해상도 또는 화면 배율이 변경되었습니다. 대상과 영역을 다시 선택하세요.', ocrFailed: '문자 인식에 실패했습니다. OCR 모델과 로컬 서비스를 확인하고 다시 시도하세요.', ocrMissing: '먼저 PP-OCRv5 mobile OCR 모델을 모두 다운로드하세요.', translationFailed: '일부 텍스트를 번역하지 못했습니다. 모델과 연결을 확인한 후 일시 정지하고 계속하세요.', shortcutConflict: '단축키를 등록할 수 없습니다. 변경하거나 페이지 또는 트레이에서 조작하세요.', invalidConfig: '캡처 대상, 번역 모델, 하나 이상의 영역과 서로 다른 원문 및 번역 언어를 선택하세요.', backendUnavailable: '로컬 인식 서비스를 사용할 수 없습니다. 다시 시도하세요.' },
}
const ocrErrors = {
  'zh-CN': { ocrCorrupt: '识别模型校验失败。请删除识别模型并重新下载。', ocrRuntimeUnavailable: '当前运行组件缺少 OCR 依赖。请更新或重新安装 Python 运行组件后重试。' },
  'zh-TW': { ocrCorrupt: '辨識模型驗證失敗。請刪除辨識模型並重新下載。', ocrRuntimeUnavailable: '目前執行元件缺少 OCR 相依套件。請更新或重新安裝 Python 執行元件後重試。' },
  'zh-HK': { ocrCorrupt: '辨識模型驗證失敗。請刪除辨識模型並重新下載。', ocrRuntimeUnavailable: '目前執行元件缺少 OCR 相依套件。請更新或重新安裝 Python 執行元件後重試。' },
  en: { ocrCorrupt: 'OCR model verification failed. Delete the OCR models and download them again.', ocrRuntimeUnavailable: 'The runtime is missing OCR dependencies. Update or reinstall the Python runtime, then retry.' },
  ja: { ocrCorrupt: 'OCRモデルの検証に失敗しました。削除して再ダウンロードしてください。', ocrRuntimeUnavailable: 'OCRの依存パッケージがありません。Pythonランタイムを更新または再インストールしてください。' },
  ko: { ocrCorrupt: 'OCR 모델 검증에 실패했습니다. 삭제하고 다시 다운로드하세요.', ocrRuntimeUnavailable: 'OCR 의존 패키지가 없습니다. Python 런타임을 업데이트하거나 다시 설치하세요.' },
}
const inPlaceHints = {
  'zh-CN': '译文覆盖在屏幕原文对应位置，鼠标操作直接穿透到下方应用。',
  'zh-TW': '譯文覆蓋在螢幕原文對應位置，滑鼠操作直接穿透至下方應用程式。',
  'zh-HK': '譯文覆蓋在螢幕原文對應位置，滑鼠操作直接穿透至下方應用程式。',
  'en': 'Translations cover the original text on screen. Mouse input passes through to the application below.',
  'ja': '画面の原文位置に訳文を重ねます。マウス操作は下のアプリに届きます。',
  'ko': '화면 원문 위치에 번역을 덮어 표시합니다. 마우스 입력은 아래 앱으로 전달됩니다.',
}
const ocrLifecycleHints = {"zh-CN": "模型管理负责下载、删除；模型网关负责加载。启动后可在屏幕原文位置覆盖译文。", "zh-TW": "模型管理負責下載與刪除，模型閘道負責載入。啟動後可在螢幕原文位置覆蓋譯文。", "zh-HK": "模型管理負責下載與刪除，模型閘道負責載入。啟動後可在螢幕原文位置覆蓋譯文。", "en": "Download and remove models here; load them in Model Gateway to translate screen text in place.", "ja": "ここでモデルのダウンロードと削除を行い、モデルゲートウェイで読み込むと画面の原文位置に訳文を表示できます。", "ko": "여기에서 모델을 다운로드하거나 삭제하고 모델 게이트웨이에서 불러와 화면 원문 위치에 번역을 표시하세요."}
const regionUi = {
  sceneTitle: ['屏幕场景', '螢幕場景', '螢幕場景', 'Screen scene', '画面翻訳シーン', '화면 번역 장면'],
  sceneDescription: ['屏幕翻译示意：框选显示器中的文字，在原位置显示译文。', '螢幕翻譯示意：框選顯示器中的文字，在原位置顯示譯文。', '螢幕翻譯示意：框選顯示器中的文字，在原位置顯示譯文。', 'Illustration: select text on a display and show its translation in place.', '画面翻訳のイメージ：文字を範囲選択し、元の位置に訳文を表示します。', '화면 번역 예시: 디스플레이의 텍스트를 선택하고 원래 위치에 번역을 표시합니다.'],
  sceneSource: ['Hello, world!', 'Hello, world!', 'Hello, world!', 'Bonjour le monde !', 'Hello, world!', 'Hello, world!'],
  sceneTranslation: ['你好，世界！', '你好，世界！', '你好，世界！', 'Hello, world!', 'こんにちは、世界！', '안녕하세요, 세계!'],
  cascade: ['分步翻译', '分步翻譯', '分步翻譯', 'Step-by-step translation', '段階的に翻訳', '단계별 번역'],
  layoutHint: ['部分译文超出选区，请扩大区域或调小字号。', '部分譯文超出選區，請擴大區域或調小字級。', '部分譯文超出選區，請擴大區域或調小字體。', 'Some translations do not fit. Enlarge the area or reduce the font size.', '訳文が領域に収まりません。領域を広げるか文字を小さくしてください。', '일부 번역이 영역에 맞지 않습니다. 영역을 넓히거나 글자 크기를 줄이세요.'],
  edit: ['选择区域', '選擇區域', '選擇區域', 'Select areas', '領域を選択', '영역 선택'],
  description: ['圈选桌面文字，在原位置持续显示译文。', '框選桌面文字，持續在原位置顯示譯文。', '框選桌面文字，持續在原位置顯示譯文。', 'Select desktop text and translate it continuously in place.', 'デスクトップの文字領域を選び、元の位置に訳文を表示します。', '바탕 화면의 텍스트 영역을 선택하고 원래 위치에 번역을 표시합니다.'],
  showRegionsShortcut: ['显示／隐藏翻译区域', '顯示／隱藏翻譯區域', '顯示／隱藏翻譯區域', 'Show / hide selected areas', '選択領域を表示／非表示', '선택 영역 표시 / 숨기기'],
  presetDraft: ['未保存区域', '未儲存區域', '未儲存區域', 'Unsaved areas', '未保存の領域', '저장되지 않은 영역'],
  presetSave: ['保存区域方案', '儲存區域方案', '儲存區域方案', 'Save area preset', '領域プリセットを保存', '영역 프리셋 저장'],
  presetSaveAs: ['另存为', '另存新檔', '另存新檔', 'Save as new', '別名で保存', '다른 이름으로 저장'],
  presetUpdate: ['更新方案', '更新方案', '更新方案', 'Update preset', 'プリセットを更新', '프리셋 업데이트'],
  presetName: ['方案名称', '方案名稱', '方案名稱', 'Preset name', 'プリセット名', '프리셋 이름'],
  presetSaveHint: ['保存矩形位置，不改变语言和模型。', '儲存矩形位置，不變更語言和模型。', '儲存矩形位置，不變更語言和模型。', 'Save rectangle positions without changing languages or models.', '言語やモデルを変えずに領域の位置を保存します。', '언어와 모델을 변경하지 않고 사각형 위치를 저장합니다.'],
  presetModified: ['已修改', '已修改', '已修改', 'Modified', '変更あり', '수정됨'],
  presetManage: ['管理区域方案', '管理區域方案', '管理區域方案', 'Manage area preset', '領域プリセットを管理', '영역 프리셋 관리'],
  presetRename: ['重命名方案', '重新命名方案', '重新命名方案', 'Rename preset', 'プリセット名を変更', '프리셋 이름 변경'],
  presetDelete: ['删除方案', '刪除方案', '刪除方案', 'Delete preset', 'プリセットを削除', '프리셋 삭제'],
  presetDeleteHint: ['删除已保存的方案，当前选区仍会保留。', '刪除已儲存的方案，目前選區仍會保留。', '刪除已儲存的方案，目前選區仍會保留。', 'Delete the saved preset. Current areas remain selected.', '保存済みプリセットを削除します。現在の領域は保持されます。', '저장된 프리셋을 삭제합니다. 현재 선택 영역은 유지됩니다.'],
  presetFailed: ['区域方案操作失败，请重试。', '區域方案操作失敗，請重試。', '區域方案操作失敗，請重試。', 'The area preset could not be updated. Retry.', '領域プリセットを更新できません。再試行してください。', '영역 프리셋을 업데이트하지 못했습니다. 다시 시도하세요.'],
  presetNameExists: ['方案名称已存在，请换一个名称。', '方案名稱已存在，請換一個名稱。', '方案名稱已存在，請換一個名稱。', 'This preset name already exists. Choose another name.', '同じプリセット名があります。別の名前を入力してください。', '같은 프리셋 이름이 있습니다. 다른 이름을 입력하세요.'],
  fontAuto: ['自动适配', '自動調整', '自動調整', 'Match source text', '原文に合わせる', '원문에 맞춤'],
  regionHint: ['最多选择 64 个矩形区域。', '最多選擇 64 個矩形區域。', '最多選擇 64 個矩形區域。', 'Select up to 64 rectangles.', '最大64個の領域を選択できます。', '최대 64개의 사각형을 선택할 수 있습니다.'],
  editorHint: ['拖动新增、移动或缩放区域；Enter 完成，Esc 取消。', '拖曳新增、移動或縮放區域；Enter 完成，Esc 取消。', '拖曳新增、移動或縮放區域；Enter 完成，Esc 取消。', 'Drag to add, move or resize. Enter confirms; Esc cancels.', 'ドラッグで追加・移動・サイズ変更。Enterで確定、Escでキャンセル。', '드래그하여 추가, 이동 또는 크기 조절. Enter로 완료, Esc로 취소.'],
} as const
const regionCopy = (locale: keyof typeof ocrErrors) => {
  const index = ['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko'].indexOf(locale)
  return Object.fromEntries(Object.entries(regionUi).map(([key, values]) => [key, values[index]])) as { [K in keyof typeof regionUi]: string }
}
const regionErrorCopy = (locale: keyof typeof ocrErrors) => {
  const index = ['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko'].indexOf(locale)
  return {
    regionsMissing: ['请选择翻译区域。', '請選擇翻譯區域。', '請選擇翻譯區域。', 'Select a translation area.', '翻訳する領域を選択してください。', '번역 영역을 선택하세요.'][index],
    sameLanguage: ['原文与译文语言不能相同。', '原文與譯文語言不能相同。', '原文與譯文語言不能相同。', 'Source and target languages must be different.', '原文と訳文には異なる言語を選択してください。', '원문과 번역 언어는 달라야 합니다.'][index],
    s2sUnsupported: ['屏幕翻译不支持当前 S2S 处理方式，请切换为分步翻译或更改网关处理方式。', '螢幕翻譯不支援目前的 S2S 處理方式，請切換為分步翻譯或變更閘道處理方式。', '螢幕翻譯不支援目前的 S2S 處理方式，請切換為分步翻譯或更改閘道處理方式。', 'Screen translation does not support the current S2S mode. Choose step-by-step translation or change the gateway mode.', '画面翻訳は現在の S2S 方式に対応していません。段階的な翻訳を選ぶか、ゲートウェイの方式を変更してください。', '화면 번역은 현재 S2S 방식을 지원하지 않습니다. 단계별 번역을 선택하거나 게이트웨이 방식을 변경하세요.'][index],
    invalidConfig: ['请选择翻译模型和至少一个区域，并使用不同的原文与译文语言。', '請選擇翻譯模型及至少一個區域，並使用不同的原文與譯文語言。', '請選擇翻譯模型及至少一個區域，並使用不同的原文與譯文語言。', 'Select a translation model and at least one area, with different source and target languages.', '翻訳モデル、1つ以上の領域と、異なる原文・訳文言語を選択してください。', '번역 모델과 하나 이상의 영역을 선택하고 원문과 번역 언어를 다르게 설정하세요.'][index],
    targetUnavailable: ['显示器不可用，请连接后重新选择区域。', '顯示器無法使用，請連接後重新選擇區域。', '顯示器無法使用，請連接後重新選擇區域。', 'The display is unavailable. Reconnect it and select areas again.', '画面を利用できません。接続して領域を選び直してください。', '디스플레이를 사용할 수 없습니다. 연결한 후 영역을 다시 선택하세요.'][index],
    targetChanged: ['显示器、分辨率或缩放已变化，请重新调整区域。', '顯示器、解析度或縮放已變更，請重新調整區域。', '顯示器、解像度或縮放已變更，請重新調整區域。', 'The display, resolution or scaling changed. Adjust the selected areas.', '画面、解像度、拡大率が変わりました。領域を調整してください。', '디스플레이, 해상도 또는 배율이 변경되었습니다. 영역을 조정하세요.'][index],
    translationFailed: ['部分文字翻译失败，请检查模型或网络，停止后重新开始翻译。', '部分文字翻譯失敗，請檢查模型或網路，停止後重新開始翻譯。', '部分文字翻譯失敗，請檢查模型或網絡，停止後重新開始翻譯。', 'Some text could not be translated. Check the model or network, then stop and restart translation.', '一部を翻訳できません。モデルや接続を確認し、停止して再開してください。', '일부 텍스트를 번역하지 못했습니다. 모델이나 네트워크를 확인한 후 중지하고 다시 시작하세요.'][index],
  }
}
const withOcrErrors = (copy: ScreenDictionary, locale: keyof typeof ocrErrors) => ({ ...copy, ...regionCopy(locale), inPlaceHint: inPlaceHints[locale], ocrLifecycleHint: ocrLifecycleHints[locale], errors: { ...copy.errors, ...ocrErrors[locale], ...regionErrorCopy(locale) } })
export const screenLocales = { 'zh-CN': withOcrErrors(zh, 'zh-CN'), 'zh-TW': withOcrErrors(tw, 'zh-TW'), 'zh-HK': withOcrErrors(hk, 'zh-HK'), en: withOcrErrors(en, 'en'), ja: withOcrErrors(ja, 'ja'), ko: withOcrErrors(ko, 'ko') }

export function screenEntries(copy: ScreenDictionary): Record<Extract<DictionaryKey, `screen.${string}`>, string> {
  const entries: Array<[`screen.${string}`, string]> = []
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value === 'string') entries.push([`screen.${key}`, value])
    else for (const [child, text] of Object.entries(value)) entries.push([`screen.${key}.${child}`, text])
  }
  return Object.fromEntries(entries) as Record<Extract<DictionaryKey, `screen.${string}`>, string>
}
