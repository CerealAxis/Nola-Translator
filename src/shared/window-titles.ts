import type { UiLanguage } from './languages'

export function appNameForLanguage(language: UiLanguage): string {
  return language === 'en' ? 'Nola Translator' : language === 'zh-TW' || language === 'zh-HK' ? '諾拉翻譯' : language === 'ko' ? '놀라 번역기' : language === 'ja' ? 'ノラ翻訳' : '诺拉翻译'
}
const titles = {
  'zh-CN': ['工作台', '漫画翻译编辑器', '延迟检测', '屏幕翻译', '游戏字幕', '实时同传', '悬浮字幕', '使用引导', '数据迁移', '字幕菜单'],
  'zh-TW': ['工作台', '漫畫翻譯編輯器', '延遲檢測', '螢幕翻譯', '遊戲字幕', '即時口譯', '懸浮字幕', '使用引導', '資料遷移', '字幕選單'],
  'zh-HK': ['工作台', '漫畫翻譯編輯器', '延遲檢測', '螢幕翻譯', '遊戲字幕', '即時傳譯', '懸浮字幕', '使用引導', '資料遷移', '字幕選單'],
  ko: ['워크벤치', '만화 번역 편집기', '지연 시간 측정', '화면 번역', '게임 자막', '실시간 통역', '플로팅 자막', '시작 안내', '데이터 이전', '자막 메뉴'],
  ja: ['ワークベンチ', '漫画翻訳エディター', '遅延測定', '画面翻訳', 'ゲーム字幕', 'リアルタイム通訳', 'フローティング字幕', 'スタートガイド', 'データ移行', '字幕メニュー'],
  en: ['Workbench', 'Comic Translation Editor', 'Latency Monitor', 'Screen Translation', 'Game Captions', 'Live Interpretation', 'Floating Captions', 'Getting Started', 'Data Migration', 'Caption Menu'],
} satisfies Record<UiLanguage, string[]>

/** Shared by native windows and renderer documents, including taskbar / Alt-Tab labels. */
export function windowTitleForUrl(raw: string, language: UiLanguage): string {
  let feature: number | undefined
  try {
    const url = new URL(raw)
    const entry = url.pathname.split('/').at(-1)
    if (entry === 'workbench.html') feature = 0
    else if (entry === 'comic-editor.html') feature = 1
    else if (entry === 'latency.html') feature = 2
    else if (entry === 'screen.html') feature = url.searchParams.get('role') === 'game-overlay' ? 4 : 3
    else if (entry === 'onboarding-card.html') feature = 7
    else if (url.searchParams.has('migration')) feature = 8
    else if (url.searchParams.has('overlayMenu')) feature = 9
    else if (url.searchParams.has('workspace')) feature = 5
    else if (url.searchParams.has('overlay') || url.searchParams.has('overlayToast')) feature = 6
  } catch { /* A document loading without a URL retains the product name. */ }
  const brand = appNameForLanguage(language)
  return feature === undefined ? brand : `${titles[language][feature]} — ${brand}`
}

export function comicEditorCloseError(language: UiLanguage): { message: string; ok: string } {
  const messages: Record<UiLanguage, { message: string; ok: string }> = {
    'zh-CN': { message: '编辑器未能完成保存，窗口已保留。请等待操作完成后重试关闭。', ok: '确定' },
    'zh-TW': { message: '編輯器未能完成儲存，視窗已保留。請等待操作完成後重試關閉。', ok: '確定' },
    'zh-HK': { message: '編輯器未能完成儲存，視窗已保留。請等待操作完成後再試關閉。', ok: '確定' },
    ko: { message: '저장을 완료하지 못해 편집기 창을 열어 두었습니다. 작업이 끝난 후 다시 닫아 주세요.', ok: '확인' },
    ja: { message: '保存が完了していないため、編集画面を開いたままにしています。処理の完了後にもう一度閉じてください。', ok: 'OK' },
    en: { message: 'The editor could not finish saving and has been kept open. Wait for the current operation to finish, then try closing again.', ok: 'OK' },
  }
  return messages[language]
}
