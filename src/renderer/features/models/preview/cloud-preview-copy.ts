import { useI18n } from '@/i18n'
import { templates, type Service } from './cloud-preview-data'

const text = {
  presetVoices: ['选择预设音色', 'Choose a preset voice', '選擇預設音色', '選擇預設音色', '기본 음성 선택', 'プリセット音声を選択'],
  providers: ['供应商', 'Providers', '供應商', '供應商', '공급자', 'プロバイダー'],
  addProvider: ['添加供应商', 'Add provider', '新增供應商', '新增供應商', '공급자 추가', 'プロバイダーを追加'],
  search: ['搜索供应商或模型', 'Search providers or models', '搜尋供應商或模型', '搜尋供應商或模型', '공급자 또는 모델 검색', 'プロバイダー・モデルを検索'],
  empty: ['此类型还没有供应商', 'No providers for this type yet', '此類型尚無供應商', '此類型暫無供應商', '이 유형에 추가한 공급자가 없습니다', 'この種類のプロバイダーはまだありません'],
  noMatch: ['没有匹配的供应商', 'No matching providers', '沒有符合的供應商', '沒有相符的供應商', '일치하는 공급자가 없습니다', '一致するプロバイダーがありません'],
  confirmRemoval: ['移除这个模型？','Remove this model?','移除這個模型？','移除此模型？','이 모델을 삭제할까요?','このモデルを削除しますか？'],
  connection: ['连接设置', 'Connection settings', '連線設定', '連線設定', '연결 설정', '接続設定'],
  models: ['已添加的模型', 'Added models', '已新增的模型', '已新增的模型', '추가된 모델', '追加したモデル'],
  noModels: ['此连接还没有模型', 'No models on this connection yet', '此連線尚無模型', '此連線暫無模型', '이 연결에 추가한 모델이 없습니다', 'この接続にはまだモデルがありません'],
  addModel: ['添加模型', 'Add model', '新增模型', '新增模型', '모델 추가', 'モデルを追加'],
  fetchModels: ['获取模型列表', 'Fetch model list', '取得模型清單', '取得模型清單', '모델 목록 가져오기', 'モデル一覧を取得'],
  fetchingModels: ['正在获取模型列表', 'Fetching models', '正在取得模型清單', '正在取得模型清單', '모델 목록 가져오는 중', 'モデル一覧を取得中'],
  fetchModelsFailed: ['获取失败', 'Could not fetch models', '取得失敗', '取得失敗', '모델 목록 가져오기 실패', 'モデル一覧の取得に失敗しました'],
  keyRequired: ['请先配置 API 密钥', 'Configure an API key first.', '請先設定 API 金鑰', '請先設定 API 金鑰', '먼저 API 키를 설정하세요.', '先に API キーを設定してください。'],
  workspaceRequired: ['请先填写百炼业务空间 ID', 'Enter the Bailian workspace ID first.', '請先填寫百煉業務空間 ID', '請先填寫百煉業務空間 ID', '먼저 Bailian 워크스페이스 ID를 입력하세요.', '先に Bailian ワークスペース ID を入力してください。'],
  invalidAddress: ['请输入有效的接口地址。', 'Enter a valid API address.', '請輸入有效的 API 位址。', '請輸入有效的 API 位址。', '올바른 API 주소를 입력하세요.', '有効な API アドレスを入力してください。'],
  accessDenied: ['服务商拒绝访问，请检查账号权限。', 'Access denied. Check your provider account permissions.', '服務商拒絕存取，請檢查帳號權限。', '服務商拒絕存取，請檢查帳號權限。', '접근이 거부되었습니다. 계정 권한을 확인하세요.', 'アクセスが拒否されました。アカウントの権限を確認してください。'],
  billingRequired: ['请检查服务商账户的余额或计费设置。', 'Check your provider account balance or billing settings.', '請檢查服務商帳戶的餘額或計費設定。', '請檢查服務商帳戶的餘額或計費設定。', '서비스 계정의 잔액 또는 결제 설정을 확인하세요.', 'アカウントの残高または請求設定を確認してください。'],
  rateLimited: ['服务商限制了请求，请检查额度或稍后重试。', 'Request limit reached. Check your quota or try again later.', '服務商限制了請求，請檢查額度或稍後再試。', '服務商限制了請求，請檢查額度或稍後再試。', '요청 한도에 도달했습니다. 할당량을 확인하거나 잠시 후 다시 시도하세요.', 'リクエストが制限されました。利用枠を確認するか、しばらくしてからお試しください。'],
  providerUnavailable: ['模型服务暂时不可用，请稍后重试。', 'The model service is unavailable. Try again later.', '模型服務暫時無法使用，請稍後再試。', '模型服務暫時無法使用，請稍後再試。', '모델 서비스를 사용할 수 없습니다. 잠시 후 다시 시도하세요.', 'モデルサービスを利用できません。しばらくしてから再試行してください。'],
  requestRejected: ['模型服务拒绝了请求，请检查接口配置。', 'The service rejected the request. Check the API settings.', '模型服務拒絕了請求，請檢查 API 設定。', '模型服務拒絕了請求，請檢查 API 設定。', '서비스가 요청을 거부했습니다. API 설정을 확인하세요.', 'サービスがリクエストを拒否しました。API 設定を確認してください。'],
  invalidList: ['接口返回的模型列表格式无效。', 'The API returned an invalid model list.', 'API 傳回的模型清單格式無效。', 'API 傳回的模型清單格式無效。', 'API가 올바르지 않은 모델 목록을 반환했습니다.', 'API が無効なモデル一覧を返しました。'],
  azureDeployment: ['请使用 Azure 部署名称手动添加模型。', 'Add the model manually using its Azure deployment name.', '請使用 Azure 部署名稱手動新增模型。', '請使用 Azure 部署名稱手動新增模型。', 'Azure 배포 이름으로 모델을 직접 추가하세요.', 'Azure のデプロイ名を使ってモデルを手動で追加してください。'],
  noTranslation: ['模型未返回译文。', 'The model returned no translation.', '模型未傳回譯文。', '模型未傳回譯文。', '모델이 번역을 반환하지 않았습니다.', 'モデルが翻訳を返しませんでした。'],
  noAudio: ['模型未返回试听音频。', 'The model returned no preview audio.', '模型未傳回試聽音訊。', '模型未傳回試聽音訊。', '모델이 미리 듣기 오디오를 반환하지 않았습니다.', 'モデルが試聴音声を返しませんでした。'],
  sampleUnavailable: ['无法读取内置测试音频。', 'Could not read the built-in test audio.', '無法讀取內建測試音訊。', '無法讀取內置測試音訊。', '내장 테스트 오디오를 읽을 수 없습니다.', '内蔵のテスト音声を読み込めませんでした。'],
  remoteEmpty: ['接口未返回可添加的模型，可以手动添加。', 'No models were returned. You can add a model manually.', 'API 未傳回可新增的模型，可以手動新增。', 'API 未傳回可新增的模型，可以手動新增。', '반환된 모델이 없습니다. 모델을 직접 추가할 수 있습니다.', 'モデルが返されませんでした。手動で追加できます。'],
  alreadyAdded: ['已添加', 'Added', '已新增', '已新增', '추가됨', '追加済み'],
  modelLimit: ['已达到对话模型数量上限（100 个）。', 'The 100-model limit has been reached.', '已達到對話模型數量上限（100 個）。', '已達到對話模型數量上限（100 個）。', '대화 모델이 100개 한도에 도달했습니다.', '対話モデルが上限の100件に達しました。'],
  addSelected: ['添加所选模型', 'Add selected models', '新增所選模型', '新增所選模型', '선택한 모델 추가', '選択したモデルを追加'],
  testConnection: ['测试连接', 'Test connection', '測試連線', '測試連線', '연결 테스트', '接続をテスト'],
  testingConnection: ['正在测试', 'Testing', '正在測試', '正在測試', '테스트 중', 'テスト中'],
  connectionPassed: ['连接成功', 'Connected', '連線成功', '連線成功', '연결 성공', '接続成功'],
  connectionLatency: ['延迟 {ms} ms', 'Latency: {ms} ms', '延遲 {ms} ms', '延遲 {ms} ms', '지연 시간: {ms} ms', '遅延: {ms} ms'],
  connectionFailed: ['连接测试失败', 'Connection failed', '連線測試失敗', '連線測試失敗', '연결 실패', '接続失敗'],
  audition: ['试听', 'Preview', '試聽', '試聽', '미리 듣기', '試聴'],
  auditionText: ['试听文本', 'Preview text', '試聽文字', '試聽文字', '미리 듣기 문장', '試聴テキスト'],
  auditionSample: ['你好，这是一段试听。', 'Hello, this is a voice preview.', '你好，這是一段試聽。', '你好，這是一段試聽。', '안녕하세요. 음성 미리 듣기입니다.', 'こんにちは。音声の試聴です。'],
  generatePreview: ['生成试听', 'Generate preview', '產生試聽', '產生試聽', '미리 듣기 생성', '試聴音声を生成'],
  previewFailed: ['生成试听失败', 'Could not generate preview', '無法產生試聽', '無法產生試聽', '미리 듣기를 생성하지 못했습니다', '試聴音声を生成できませんでした'],
  playbackFailed: ['试听音频无法播放', 'Preview audio could not be played', '無法播放試聽音訊', '無法播放試聽音訊', '미리 듣기 오디오를 재생할 수 없습니다', '試聴音声を再生できませんでした'],
  editModel: ['编辑模型', 'Edit model', '編輯模型', '編輯模型', '모델 편집', 'モデルを編集'],
  custom: ['自定义接口', 'Custom endpoint', '自訂介面', '自訂介面', '사용자 지정 엔드포인트', 'カスタムエンドポイント'],
  changeIcon: ['更换图标', 'Change icon', '更換圖示', '更換圖示', '아이콘 변경', 'アイコンを変更'],
  searchIcons: ['搜索图标', 'Search icons', '搜尋圖示', '搜尋圖示', '아이콘 검색', 'アイコンを検索'],
  iconNamePlaceholder: ['输入图标名称', 'Enter icon name', '輸入圖示名稱', '輸入圖示名稱', '아이콘 이름 입력', 'アイコン名を入力'],
  defaultIcon: ['默认图标', 'Default icon', '預設圖示', '預設圖示', '기본 아이콘', '既定のアイコン'],
} satisfies Record<string, [string, string, string, string, string, string]>

const column = { 'zh-CN': 0, en: 1, 'zh-TW': 2, 'zh-HK': 3, ko: 4, ja: 5 } as const
export function useCloudPreviewCopy() {
  const { language } = useI18n()
  return (key: keyof typeof text) => text[key][column[language]]
}

export function useCloudTemplateName() {
  const { t } = useI18n()
  const copy = useCloudPreviewCopy()
  return (service: Service) => service === 'aliyun' ? t('settings.providerAliyun') : templates[service].name || copy('custom')
}

const speechFields: Record<string, [string, string, string, string, string, string]> = {
  format: ['音频格式', 'Audio format', '音訊格式', '音訊格式', '오디오 형식', '音声形式'],
  outputFormat: ['输出格式', 'Output format', '輸出格式', '輸出格式', '출력 형식', '出力形式'],
  style: ['风格', 'Style', '風格', '風格', '스타일', 'スタイル'],
  dialect: ['方言', 'Dialect', '方言', '方言', '방언', '方言'],
  seedText: ['参考文本', 'Reference text', '參考文字', '參考文字', '참고 텍스트', '参照テキスト'],
  rate: ['语速', 'Speaking rate', '語速', '語速', '말하기 속도', '話速'],
  speed: ['语速', 'Speaking rate', '語速', '語速', '말하기 속도', '話速'],
  volume: ['音量', 'Volume', '音量', '音量', '볼륨', '音量'],
  pitch: ['音高', 'Pitch', '音高', '音高', '음높이', 'ピッチ'],
  character: ['角色', 'Character', '角色', '角色', '캐릭터', 'キャラクター'],
  region: ['区域', 'Region', '區域', '區域', '리전', 'リージョン'],
  role: ['角色', 'Role', '角色', '角色', '역할', '役割'],
  groupId: ['Group ID', 'Group ID', 'Group ID', 'Group ID', 'Group ID', 'Group ID'],
  languageBoost: ['语言增强', 'Language boost', '語言增強', '語言增強', '언어 향상', '言語ブースト'],
  emotion: ['情绪', 'Emotion', '情緒', '情緒', '감정', '感情'],
  latexRead: ['朗读 LaTeX', 'Read LaTeX', '朗讀 LaTeX', '朗讀 LaTeX', 'LaTeX 읽기', 'LaTeX を読み上げる'],
  englishNormalization: ['英文规范化', 'English normalization', '英文正規化', '英文正規化', '영어 정규화', '英語の正規化'],
  timbreWeights: ['音色权重', 'Voice weights', '音色權重', '音色權重', '음색 가중치', '音色の重み'],
  appId: ['App ID', 'App ID', 'App ID', 'App ID', 'App ID', 'App ID'],
  cluster: ['集群', 'Cluster', '叢集', '叢集', '클러스터', 'クラスター'],
  prefix: ['提示词前缀', 'Prompt prefix', '提示詞前綴', '提示詞前綴', '프롬프트 접두어', 'プロンプトの接頭辞'],
  stability: ['稳定性', 'Stability', '穩定性', '穩定性', '안정성', '安定性'],
  similarityBoost: ['相似度', 'Similarity boost', '相似度', '相似度', '유사도', '類似度'],
  speakerBoost: ['音色增强', 'Speaker boost', '音色增強', '音色增強', '음색 향상', '話者ブースト'],
}

export function speechFieldLabel(language: keyof typeof column, field: string) {
  return speechFields[field]?.[column[language]] ?? field
}
