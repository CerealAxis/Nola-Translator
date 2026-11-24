import type { UiLanguage } from '../../../../shared/languages'

const languages: UiLanguage[] = ['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko']
const labels = {
  interval: ['识别间隔', '辨識間隔', '辨識間隔', 'Recognition interval', '認識間隔', '인식 간격'],
  source: ['获取来源', '擷取來源', '擷取來源', 'Text source', '取得元', '텍스트 소스'],
  software: ['软件选择', '軟體選擇', '軟件選擇', 'Software', 'ソフトウェア', '소프트웨어'],
  selectSoftware: ['选择正在运行的软件', '選擇執行中的軟體', '選擇執行中的軟件', 'Select running software', '実行中のソフトを選択', '실행 중인 소프트웨어 선택'],
  hookSettings: ['Hook 设置', 'Hook 設定', 'Hook 設定', 'Hook settings', 'Hook 設定', 'Hook 설정'],
  pick: ['选择游戏', '選擇遊戲', '選擇遊戲', 'Select game', 'ゲームを選択', '게임 선택'],
  selectText: ['选择文本', '選擇文字', '選擇文字', 'Select text', 'テキストを選択', '텍스트 선택'],
  range: ['选取 OCR 范围', '選取 OCR 範圍', '選取 OCR 範圍', 'Select OCR region', 'OCR 範囲を選択', 'OCR 영역 선택'],
  read: ['读取剪贴板', '讀取剪貼簿', '讀取剪貼簿', 'Read clipboard', 'クリップボードを読み取る', '클립보드 읽기'],
  tools: ['翻译工具', '翻譯工具', '翻譯工具', 'Translation tools', '翻訳ツール', '번역 도구'],
  off: ['关闭输入', '關閉輸入', '關閉輸入', 'Input off', '入力をオフ', '입력 끄기'],
  sourceHint: ['一次只接收一种来源的文本。临时识别菜单可用「进行一次 OCR」。', '一次只接收一種來源的文字。臨時辨識選單可用「進行一次 OCR」。', '一次只接收一種來源的文字。臨時辨識選單可用「進行一次 OCR」。', 'One source supplies text at a time. Use one-time OCR to read a game menu.', '入力元は一度に一つです。メニューには単発 OCR を使えます。', '텍스트 입력은 한 번에 한 종류만 사용합니다. 메뉴는 일회성 OCR로 읽을 수 있습니다.'],
  once: ['进行一次 OCR', '進行一次 OCR', '進行一次 OCR', 'One-time OCR', '一度だけ OCR', '일회성 OCR'],
  again: ['再次进行 OCR', '再次進行 OCR', '再次進行 OCR', 'Repeat OCR', '同じ範囲で OCR', '같은 영역 다시 인식'],
  automatic: ['自动取字', '自動取字', '自動擷取文字', 'Automatic text capture', '自動テキスト取得', '자동 텍스트 가져오기'],
  bind: ['绑定窗口', '綁定視窗', '綁定視窗', 'Bind window', 'ウィンドウを連携', '창 연결'],
  unbind: ['解绑窗口', '解除綁定', '解除綁定', 'Unbind window', '連携を解除', '창 연결 해제'],
  captions: ['显示译文', '顯示譯文', '顯示譯文', 'Show translation', '訳文を表示', '번역 표시'],
  originals: ['显示原文', '顯示原文', '顯示原文', 'Show original', '原文を表示', '원문 표시'],
  originalSize: ['原文字号', '原文字級', '原文字體大小', 'Original font size', '原文の文字サイズ', '원문 글자 크기'],
  translationSize: ['译文字号', '譯文字級', '譯文字體大小', 'Translation font size', '訳文の文字サイズ', '번역 글자 크기'],
  provider: ['显示翻译器名称', '顯示翻譯器名稱', '顯示翻譯器名稱', 'Show translator name', '翻訳元の名前を表示', '번역기 이름 표시'],
  result: ['译文来源', '譯文來源', '譯文來源', 'Translation source', '訳文の提供元', '번역 출처'],
  memory: ['预翻译', '預翻譯', '預翻譯', 'Translation memory', '事前翻訳', '사전 번역'],
  offline: ['网关已停止', '閘道已停止', '閘道已停止', 'Gateway stopped', 'ゲートウェイ停止中', '게이트웨이 중지됨'],
  missing: ['缺少模型资源', '缺少模型資源', '缺少模型資源', 'Model resources missing', 'モデルがありません', '모델 리소스 없음'],
  unsupported: ['不支持当前语言对', '不支援目前的語言對', '不支援目前的語言組合', 'Unsupported language pair', '非対応の言語ペア', '지원하지 않는 언어 조합'],
  loading: ['模型加载中', '模型載入中', '模型載入中', 'Model loading', 'モデルを読み込み中', '모델 로드 중'],
  failed: ['翻译失败', '翻譯失敗', '翻譯失敗', 'Translation failed', '翻訳失敗', '번역 실패'],
  noTranslation: ['没有匹配的译文', '沒有符合的譯文', '沒有相符的譯文', 'No matching translation', '一致する訳文がありません', '일치하는 번역 없음'],
  saveFailed: ['游戏设置和记录未能保存到本机。', '遊戲設定和記錄未能儲存到本機。', '無法在本機儲存遊戲設定和記錄。', 'Could not save game settings and history on this device.', 'ゲーム設定と履歴を保存できませんでした。', '게임 설정과 기록을 기기에 저장하지 못했습니다.'],
} satisfies Record<string, [string, string, string, string, string, string]>

export function pageText(language: UiLanguage, key: keyof typeof labels) {
  return labels[key][languages.indexOf(language)]
}
