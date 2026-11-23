import type { UiLanguage } from '@/i18n'

const zh = {
  add: '添加模型', edit: '编辑模型', smart: '智能配置',
  pending: '正在匹配模型…', missing: '未找到预设参数，请手动填写。', error: '无法获取预设参数，请手动填写。',
  matched: '模型配置匹配成功',
  duplicate: '此供应商已添加相同的模型 ID。', limits: '请输入整数。上下文窗口须为 {min}–{max}，最大输出须为 1 至上下文窗口。',
  inputs: '输入类型', text: '文本', image: '图片', video: '视频',
  levels: '推理等级（从低到高）', addLevel: '添加推理等级', removeLevel: '移除推理等级',
  reset: '重置表单',
}
const tw: typeof zh = {
  add: '新增模型', edit: '編輯模型', smart: '智慧設定',
  pending: '正在比對模型…', missing: '找不到預設參數，請手動填寫。', error: '無法取得預設參數，請手動填寫。',
  matched: '模型設定比對成功',
  duplicate: '此供應商已加入相同的模型 ID。', limits: '請輸入整數。上下文視窗須為 {min}–{max}，最大輸出須介於 1 與上下文視窗之間。',
  inputs: '輸入類型', text: '文字', image: '圖片', video: '影片',
  levels: '推理等級（從低到高）', addLevel: '新增推理等級', removeLevel: '移除推理等級',
  reset: '重設表單',
}
export const llmPreviewCopy: Record<UiLanguage, typeof zh> = {
  'zh-CN': zh, 'zh-TW': tw, 'zh-HK': { ...tw, smart: '智能設定', video: '影片' },
  en: {
    add: 'Add model', edit: 'Edit model', smart: 'Autofill',
    pending: 'Matching model…', missing: 'No preset found. Enter the parameters manually.', error: 'Could not fetch preset parameters. Enter them manually.',
    matched: 'Model configuration matched',
    duplicate: 'This provider already has a model with this ID.', limits: 'Use whole numbers. Set context to {min}–{max} and maximum output to 1 up to the context size.',
    inputs: 'Input types', text: 'Text', image: 'Images', video: 'Video',
    levels: 'Reasoning levels (lowest first)', addLevel: 'Add reasoning level', removeLevel: 'Remove reasoning level',
    reset: 'Reset form',
  },
  ja: {
    add: 'モデルを追加', edit: 'モデルを編集', smart: '自動入力',
    pending: 'モデルを照合中…', missing: 'プリセットが見つかりません。手動で入力してください。', error: 'プリセットを取得できませんでした。手動で入力してください。',
    matched: 'モデル設定が一致しました',
    duplicate: 'このプロバイダーには同じモデル ID が登録されています。', limits: '整数を入力してください。コンテキストは {min}〜{max}、最大出力は 1 以上コンテキスト以下です。',
    inputs: '入力タイプ', text: 'テキスト', image: '画像', video: '動画',
    levels: '推論レベル（低い順）', addLevel: '推論レベルを追加', removeLevel: '推論レベルを削除',
    reset: 'フォームをリセット',
  },
  ko: {
    add: '모델 추가', edit: '모델 편집', smart: '자동 입력',
    pending: '모델을 확인하는 중…', missing: '프리셋이 없습니다. 값을 직접 입력하세요.', error: '프리셋을 가져오지 못했습니다. 값을 직접 입력하세요.',
    matched: '모델 설정을 찾았습니다',
    duplicate: '이 공급자에 같은 ID의 모델이 이미 있습니다.', limits: '정수를 입력하세요. 컨텍스트는 {min}~{max}, 최대 출력은 1 이상 컨텍스트 이하여야 합니다.',
    inputs: '입력 유형', text: '텍스트', image: '이미지', video: '동영상',
    levels: '추론 수준 (낮은 순)', addLevel: '추론 수준 추가', removeLevel: '추론 수준 삭제',
    reset: '양식 초기화',
  },
}
