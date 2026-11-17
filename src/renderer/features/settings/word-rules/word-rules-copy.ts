import { useI18n } from '@/i18n'
const copy = {
  preserve: ['禁翻词', '禁翻詞', '禁翻詞', 'Do not translate', '翻訳しない語句', '번역 제외 단어'],
  mask: [
    '字幕屏蔽词',
    '字幕屏蔽詞',
    '字幕屏蔽詞',
    'Subtitle blocked words',
    '字幕の伏せ字',
    '자막 가림 단어',
  ],
  term: ['词语', '詞語', '詞語', 'Term', '語句', '단어'],
  language: ['匹配语言', '比對語言', '比對語言', 'Match language', '対象言語', '일치 언어'],
  libraries: ['词库', '詞庫', '詞庫', 'Libraries', '単語集', '단어집'],
  newLibrary: ['新建词库', '新增詞庫', '新增詞庫', 'New library', '単語集を作成', '단어집 만들기'],
  addTerm: ['添加词语', '新增詞語', '新增詞語', 'Add term', '語句を追加', '단어 추가'],
  empty: [
    '还没有词库',
    '尚未建立詞庫',
    '尚未建立詞庫',
    'No libraries yet',
    '単語集はまだありません',
    '단어집이 없습니다',
  ],
  entries: ['词条', '詞條', '詞條', 'Entries', '語句', '항목'],
  enabled: ['启用', '啟用', '啟用', 'Enabled', '有効', '활성화'],
  off: ['关闭', '關閉', '關閉', 'Off', 'オフ', '끄기'],
  selected: ['选择词库', '選擇詞庫', '選擇詞庫', 'Choose libraries', '単語集を選択', '단어집 선택'],
  settings: ['管理词库', '管理詞庫', '管理詞庫', 'Manage libraries', '単語集を管理', '단어집 관리'],
  selectAll: ['全选', '全選', '全選', 'Select all', 'すべて選択', '모두 선택'],
  enable: [
    '启用所选',
    '啟用所選',
    '啟用所選',
    'Enable selected',
    '選択を有効化',
    '선택 항목 활성화',
  ],
  disable: [
    '停用所选',
    '停用所選',
    '停用所選',
    'Disable selected',
    '選択を無効化',
    '선택 항목 비활성화',
  ],
  matched: ['匹配结果', '比對結果', '比對結果', 'Match result', '一致結果', '일치 결과'],
} as const
export function useWordRuleText() {
  const { language } = useI18n()
  const index =
    ({ 'zh-CN': 0, 'zh-TW': 1, 'zh-HK': 2, en: 3, ja: 4, ko: 5 } as const)[language] ?? 3
  return (key: keyof typeof copy) => copy[key][index]
}
