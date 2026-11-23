import type { UiLanguage } from '@/i18n'

const translations = {
  supportedLanguages: ['支持语言', '支援語言', '支援語言', 'Supported languages', '対応言語', '지원 언어'],
  speechLanguages: ['语音输出语言', '語音輸出語言', '語音輸出語言', 'Speech output languages', '音声出力の言語', '음성 출력 언어'],
  languagesByVoice: ['取决于所选音色', '依所選音色而定', '視乎所選音色', 'Depends on the selected voice', '選択した音声によって異なります', '선택한 음성에 따라 다름'],
  languagesPartial: ['部分支持语言', '部分支援語言', '部分支援語言', 'Some supported languages', '対応言語の一部', '일부 지원 언어'],
  languagesUnknown: ['暂无该模型的语言清单', '暫無此模型的語言清單', '暫無此模型的語言清單', 'No language list for this model', 'このモデルの言語一覧はありません', '이 모델의 언어 목록 없음'],
  localSeries: ['{name} 系列', '{name} 系列', '{name} 系列', '{name} series', '{name} シリーズ', '{name} 시리즈'],
  title: ['模型配置', '模型設定', '模型設定', 'Model setup', 'モデル設定', '모델 설정'],
  category: ['模型分类', '模型分類', '模型分類', 'Model category', 'モデルのカテゴリ', '모델 분류'],
  downloads: ['下载管理', '下載管理', '下載管理', 'Download manager', 'ダウンロード管理', '다운로드 관리'],
  sources: ['模型来源', '模型來源', '模型來源', 'Model sources', 'モデルソース', '모델 소스'],
  local: ['本地', '本機', '本機', 'Local', 'ローカル', '로컬'],
  cloud: ['云端', '雲端', '雲端', 'Cloud', 'クラウド', '클라우드'],
  installedModels: ['已安装的模型', '已安裝的模型', '已安裝的模型', 'Installed models', 'インストール済みモデル', '설치된 모델'],
  noInstalledModels: ['尚未安装模型', '尚未安裝模型', '尚未安裝模型', 'No models installed', 'インストール済みのモデルはありません', '설치된 모델이 없습니다'],
  add: ['新增', '新增', '新增', 'Add', '追加', '추가'],
  addSource: ['添加模型来源', '新增模型來源', '新增模型來源', 'Add a model source', 'モデルソースを追加', '모델 소스 추가'],
  providers: ['云端供应商', '雲端供應商', '雲端供應商', 'Cloud providers', 'クラウドプロバイダー', '클라우드 공급자'],
  search: ['搜索供应商或模型', '搜尋供應商或模型', '搜尋供應商或模型', 'Search providers or models', 'プロバイダー・モデルを検索', '공급자 또는 모델 검색'],
  empty: ['尚未添加模型来源', '尚未新增模型來源', '尚未新增模型來源', 'No model sources yet', 'モデルソースはまだありません', '아직 모델 소스가 없습니다'],
  remove: ['移除', '移除', '移除', 'Remove', '削除', '삭제'],
  removeSource: ['移除「{name}」？', '移除「{name}」？', '移除「{name}」？', 'Remove {name}?', '「{name}」を削除しますか？', '{name} 소스를 삭제할까요?'],
  sourceAddFailed: ['添加模型来源失败', '新增模型來源失敗', '新增模型來源失敗', 'Could not add the model source', 'モデルソースを追加できませんでした', '모델 소스를 추가하지 못했습니다'],
  sourceRemoveFailed: ['移除模型来源失败', '移除模型來源失敗', '移除模型來源失敗', 'Could not remove the model source', 'モデルソースを削除できませんでした', '모델 소스를 제거하지 못했습니다'],
  sourceLoadFailed: ['模型来源设置加载失败', '模型來源設定載入失敗', '模型來源設定載入失敗', 'Could not load model source settings', 'モデルソース設定を読み込めませんでした', '모델 소스 설정을 불러오지 못했습니다'],
  localModelsLoadFailed: ['本地模型列表加载失败', '本機模型清單載入失敗', '本機模型清單載入失敗', 'Could not load local models', 'ローカルモデルを読み込めませんでした', '로컬 모델을 불러오지 못했습니다'],
  LLM: ['对话', '對話', '對話', 'Chat', 'チャット', '대화'],
  MT: ['文本翻译', '文字翻譯', '文字翻譯', 'Translation', 'テキスト翻訳', '텍스트 번역'],
  S2S: ['语音同传', '語音口譯', '語音傳譯', 'Speech translation', '音声翻訳', '음성 통역'],
  detect: ['漫画检测', '漫畫偵測', '漫畫偵測', 'Comic detection', '漫画検出', '만화 감지'],
  inpaint: ['漫画修复', '漫畫修復', '漫畫修復', 'Comic inpainting', '漫画修復', '만화 복원'],
} satisfies Record<string, [string, string, string, string, string, string]>

const columns = { 'zh-CN': 0, 'zh-TW': 1, 'zh-HK': 2, en: 3, ja: 4, ko: 5 } as const

export function modelWorkspaceText(language: UiLanguage, key: keyof typeof translations) {
  return translations[key][columns[language]]
}

export function localSeriesName(language: UiLanguage, name: string) {
  return modelWorkspaceText(language, 'localSeries').replace('{name}', () => name)
}
